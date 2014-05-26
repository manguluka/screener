// conductor.js
/* 
 *  Copyright (c) 2014 James Leigh, Some Rights Reserved
 * 
 *  Redistribution and use in source and binary forms, with or without
 *  modification, are permitted provided that the following conditions are met:
 * 
 *  1. Redistributions of source code must retain the above copyright notice,
 *  this list of conditions and the following disclaimer.
 * 
 *  2. Redistributions in binary form must reproduce the above copyright
 *  notice, this list of conditions and the following disclaimer in the
 *  documentation and/or other materials provided with the distribution.
 * 
 *  3. Neither the name of the copyright holder nor the names of its
 *  contributors may be used to endorse or promote products derived from this
 *  software without specific prior written permission.
 * 
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 *  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 *  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 *  ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 *  LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 *  CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 *  SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 *  INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 *  CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */
/*
 * Does not access IndexedDB directly, but handles data assembly/screening and
 * builds requested dataset based on sub messages sent to other workers
 */

importScripts('../assets/underscore/underscore.js');

self.addEventListener("connect", _.partial(function(services, event) {
    event.ports[0].onmessage = _.partial(dispatch, {

        close: function(event) {
            self.close();
        },

        ping: function() {
            return 'pong';
        },

        register: (function(services, event) {
            console.log("Registering service", event.data.name);
            if (!services[event.data.service]) {
                services[event.data.service] = {};
            }
            services[event.data.service][event.data.name] = event.ports[0];
        }).bind(this, services),

        validate: (function(services, event){
            var key = getWorker(services.mentat, event.data.expression);
            return promiseMessage({
                cmd: 'fields',
                expressions: [event.data.expression]
            }, services.mentat[key], key).then(_.property('result')).then(function(fields){
                return Promise.all(_.map(services.quote, function(quote, key){
                    return promiseMessage({
                        cmd: 'validate',
                        interval: event.data.interval,
                        fields: _.without(fields, 'asof')
                    }, quote, key).catch(Promise.resolve);
                }));
            }).then(function(results){
                return results.filter(function(result){
                    return result.status == 'success' || result.message;
                });
            }).then(function(results){
                if (!results.length) throw new Error("Unknown interval: " + event.data.interval);
                return results;
            }).then(function(results){
                if (_.every(results, function(result){
                    return result.status != 'success';
                })) return results[0];
                return results.filter(function(result){
                    return result.status == 'success';
                })[0];
            });
        }).bind(this, services),

        'exchange-list': _.memoize(function(event) {
            return promiseJSON('../queries/exchange-list.rq?tqx=out:table')
                .then(tableToObjectArray)
                .then(function(result){
                    return result;
                });
        }),

        'sector-list': serviceMessage.bind(this, services, 'list'),

        'security-list': serviceMessage.bind(this, services, 'list'),

        'indicator-list': _.memoize(function(event) {
            return promiseJSON('../queries/indicator-list.rq?tqx=out:table')
                .then(tableToObjectArray)
                .then(function(result){
                    return result;
            });
        }),

        load: (function(services, event) {
            var data = event.data;
            var worker = getWorker(services.mentat, data.security);
            return retryAfterImport(services, data, true, services.mentat[worker], worker).then(function(data){
                return data.result;
            });
        }).bind(this, services),

        'watch-list': function(params) {
            var url = '../queries/watch-list.rq?tqx=out:table';
            return promiseJSON(params ? (url + '&' + params) : url)
                .then(tableToObjectArray)
                .then(function(result){
                    return result;
                });
        },

        'screen-list': function(params) {
            var url = '../queries/screen-list.rq?tqx=out:table';
            return promiseJSON(params ? (url + '&' + params) : url)
                .then(tableToObjectArray)
                .then(function(result){
                    return result;
                });
        },

        screen: screenSecurities.bind(this, services)
    });
}, {list: {}, quote: {}, mentat: {}}), false);

function screenSecurities(services, event) {
    var data = event.data;
    var load = data.load;
    var byExchange = _.groupBy(data.watchLists, _.compose(_.property('iri'), _.property('exchange')));
    return Promise.all(_.map(byExchange, function(watchLists) {
        var exchange = watchLists[0].exchange;
        var filter = filterSecurity.bind(this, services, data.screens, data.asof, load, exchange);
        return listSecurities(services, watchLists).then(function(securities) {
            return Promise.all(securities.map(filter));
        });
    })).then(_.flatten).then(function(result) {
        var groups = _.groupBy(_.compact(result), function(obj){
            return obj.status && obj.status != 'success' ? 'error' : 'result';
        });
        var success = _.isEqual(['result'], _.keys(groups));
        var warning =  groups.result && groups.error;
        return _.extend({
            status: success ? 'success' : warning ? 'warning' : 'error',
            message: groups.error && _.uniq(_.pluck(groups.error, 'message').sort(), true).join('\n')
        }, groups);
    });
}

function listSecurities(services, watchLists) {
    return Promise.all(watchLists.map(function(watchList){
        return Promise.resolve(watchList).then(function(watchList){
            if (!watchList.includeSectors)
                return [];
            return Promise.all(watchList.includeSectors.map(function(sector){
                return serviceMessage(services, 'list', {
                    data: {
                        cmd: 'security-list',
                        exchange: watchList.exchange,
                        sector: sector,
                        mincap: watchList.mincap,
                        maxcap: watchList.maxcap
                    }
                }).then(_.property('result'));
            }));
        }).then(_.flatten).then(function(result){
            var includes = watchList.includes || [];
            var excludes = watchList.excludes || [];
            return includes.concat(_.difference(result, excludes));
        });
    })).then(_.flatten).then(_.uniq);
}

function filterSecurity(services, screens, asof, load, exchange, security){
    var worker = getWorker(services.mentat, security);
    return retryAfterImport(services, {
        cmd: 'screen',
        asof: asof,
        screens: screens,
        exchange: exchange,
        security: security
    }, load, services.mentat[worker], worker).then(function(data){
        return data.result;
    }).catch(function(error){
        console.log("Could not load", security, error.status, error);
        return normalizedError(error);
    });
}

function retryAfterImport(services, data, load, port, worker) {
    return promiseMessage(_.extend({
        failfast: load !== false
    }, data), port, worker).catch(function(error){
        if (load === false && error.quote && error.status == 'warning')
            return error; // just use what we have
        if (!error.quote || load === false)
            return Promise.reject(error);
        // try to load more
        return Promise.all(error.quote.map(function(request){
            return Promise.all(_.map(services.quote, function(quote){
                return promiseMessage(_.extend({
                    cmd: 'quote'
                }, request), quote).then(function(data){
                    if (data.result.length == 0) return null;
                    return promiseMessage({
                        cmd: 'import',
                        security: request.security,
                        interval: request.interval,
                        exchange: request.exchange,
                        points: data.result
                    }, port, worker);
                });
            }));
        })).then(_.flatten).then(_.compact).then(function(imported){
            if (load && imported.length == 0)
                return Promise.reject(error); // didn't load anything, but asked
            return promiseMessage(data, port, worker).catch(function(error){
                if (error.status == 'warning') {
                    // just use what we have
                    return Promise.resolve(error);
                } else {
                    return Promise.reject(error);
                }
            });
        });
    });
}

function tableToObjectArray(table){
    return table.rows.map(function(row){
        return _.object(table.columns, row);
    });
}

function promiseMessage(data, port, worker) {
    return new Promise(function(resolve, reject){
        var channel = new MessageChannel();
        var timeout = setTimeout(function(){
            console.log("Still waiting on " + worker + " for a response to", data);
            timeout = setTimeout(function(){
                console.log("Aborting " + worker + " response to", data);
                reject(_.extend({}, data, {status: 'error', message: "Service took too long to respond"}));
            }, 30000);
        }, 30000);
        channel.port2.onmessage = function(event) {
            clearTimeout(timeout);
            if (!event.data || event.data.status === undefined || event.data.status == 'success') {
                resolve(event.data);
            } else {
                reject(event.data);
            }
        };
        port.postMessage(data, [channel.port1]);
    });
}

function serviceMessage(services, name, event) {
    if (!services[name] || !_.keys(services[name]).length)
        throw new Error('No ' + name + ' service registered');
    return Promise.all(_.map(services[name], function(service, key) {
        return promiseMessage(event.data, service, key);
    })).then(combineResult);
}

function combineResult(results){
    return _.reduce(results, function(memo, msg) {
        var result = msg.result.concat(memo.result);
        return _.extend(memo, msg, {result: result});
    }, {result: []});
}

var throttledLog = _.throttle(console.log.bind(console), 1000);
function getWorker(workers, string) {
    var keys = _.keys(workers);
    var mod = keys.length;
    var w = (hashCode(string) % mod + mod) % mod;
    var key = keys[w];
    throttledLog("Called worker ", key);
    return key;
}

function hashCode(str){
    var hash = 0, i, char;
    if (str.length === 0) return hash;
    for (i = 0, l = str.length; i < l; i++) {
        char  = str.charCodeAt(i);
        hash  = ((hash<<5)-hash)+char;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

function promiseJSON(url) {
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function(){
            if (xhr.readyState == 4 && (xhr.status == 200 || xhr.status == 203)) {
                resolve(JSON.parse(xhr.responseText));
            } else if (xhr.readyState == 4) {
                reject({status: xhr.statusText, statusCode: xhr.status, message: xhr.responseText});
            }
        };
        xhr.open("GET", url, true);
        xhr.send();
    });
}

function dispatch(handler, event){
    var cmd = event.data.cmd || event.data;
    if (typeof cmd == 'string' && typeof handler[cmd] == 'function') {
        Promise.resolve(event).then(handler[cmd]).then(function(result){
            if (_.isObject(result) && result.status && _.isObject(event.data)) {
                event.ports[0].postMessage(_.extend(_.omit(event.data, 'points', 'result'), result));
            } else if (result !== undefined) {
                event.ports[0].postMessage(result);
            }
        }).catch(rejectNormalizedError).catch(function(error){
            var clone = _.isString(event.data) ? {cmd: event.data} : _.omit(event.data, 'points', 'result');
            event.ports[0].postMessage(_.extend(clone, error));
        });
    } else if (event.ports && event.ports.length) {
        console.log('Unknown command ' + cmd);
        event.ports[0].postMessage({
            status: 'error',
            message: 'Unknown command ' + cmd
        });
    } else {
        console.log(event.data);
    }
}

function rejectNormalizedError(error) {
    if (error.status != 'error' || error.message) {
        console.log(error);
    }
    return Promise.reject(normalizedError(error));
}

function normalizedError(error) {
    if (error && error.status && error.status != 'success') {
        return error;
    } else if (error.target && error.target.errorCode){
        return {
            status: 'error',
            errorCode: error.target.errorCode
        };
    } else if (error.message && error.stack) {
        return _.extend({
            status: 'error',
            message: error.message,
            stack: error.stack
        }, _.omit(error, 'prototype', _.functions(error)));
    } else if (error.message) {
        return _.extend({
            status: 'error'
        }, _.omit(error, 'prototype', _.functions(error)));
    } else {
        return {
            status: 'error',
            message: error
        };
    }
}
