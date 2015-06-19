// screener.js
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

(function($){

    var screener = window.screener = (function(postDispatchMessage){
        return _.extend(window.screener || {}, {

            getBacktestAsOfDateString: function() {
                var date = screener.getBacktestAsOf();
                return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
            },

            setBacktestAsOfDateString: function(localDateString){
                screener.setBacktestAsOf(localDateString);
            },
    
            getBacktestAsOf: function() {
                var date = screener.getItem('backtest-as-of');
                if (!date)
                    return new Date();
                try {
                    var ms = parseInt(date, 10);
                    return isNaN(ms) && new Date() || new Date(ms);
                } catch (e) {
                    console.log("Invalid date: ", date);
                    return new Date();
                }
            },
    
            setBacktestAsOf: function(dateOrLocalString) {
                var date = _.isString(dateOrLocalString) ? parseAsOf(dateOrLocalString) : dateOrLocalString;
                if (_.isDate(date) && date.valueOf() > Date.now() - 60 * 60 * 1000) {
                    screener.removeItem('backtest-as-of');
                } else if (_.isDate(date)) {
                    screener.setItem('backtest-as-of', date.valueOf());
                } else {
                    throw new Error("Not a Date object: " + date);
                }
            },

            getItem: function(key, defaultValue) {
                return sessionStorage.getItem(key) ||
                    localStorage.getItem(key) ||
                    typeof defaultValue == 'function' && defaultValue() ||
                    defaultValue;
            },
        
            setItem: function(key, value) {
                sessionStorage.setItem(key, value);
                localStorage.setItem(key, value);
            },
        
            removeItem: function(key) {
                sessionStorage.removeItem(key);
                localStorage.removeItem(key);
            },

            debouncePromise: function(func, wait) {
                var end = Promise.resolve();
                return function(/* arguments */) {
                    var context = this;
                    var args = arguments;
                    var current = end = end.catch(function() {
                        // ignore previous error
                    }).then(function(){
                        if (current === end) return new Promise(function(resolve){
                            _.delay(resolve, wait); // wait for another call
                        });
                    }).then(function() {
                        if (current === end) // no other calls
                            return func.apply(context, args);
                    });
                    return theEnd(current);
                };
                function theEnd(current){
                    return end.then(function(resolved){
                        if (resolved !== undefined || current === end)
                            return Promise.resolve(resolved);
                        return theEnd(end); // return the very last one
                    });
                }
            },

            pceil: function(x, precision) {
                if (x === 0 || !_.isNumber(x))
                    return x;
                var ex = Math.floor(Math.log(Math.abs(x))/Math.log(10)) - precision + 1;
                var div = Math.pow(10, Math.abs(ex));
                if (ex > 0) return Math.ceil(x / div) * div;
                if (ex < 0) return Math.ceil(x * div) / div;
                return Math.ceil(x);
            },

            formatNumber: suffixScale.bind(this, _.memoize(getScaleSuffix)),

            formatCurrency: function(number) {
                return '$' + number.toFixed(2);
            },

            ping: function() {
                return postDispatchMessage("ping");
            },

            validate: function(expression, interval) {
                var int = interval && interval.indexOf('/') ? interval.substring(interval.lastIndexOf('/') + 1) : interval;
                return postDispatchMessage({
                    cmd: 'validate',
                    expression: expression,
                    interval: int
                });
            },

            listExchanges: _.memoize(function(){
                return calli.getJSON($('#queries').prop('href') + 'exchange-list.rq?tqx=out:table').then(tableToObjectArray);
            }),

            listSectors: _.memoize(function(exchange) {
                if (!exchange) return Promise.resolve([]);
                return getExchange(exchange).then(function(exchange){
                    return postDispatchMessage({
                        cmd: 'sector-list',
                        exchange: exchange
                    });
                });
            }),

            listSecurities: function(exchange, sectors, mincap, maxcap) {
                return getExchange(exchange).then(function(exchange){
                    return Promise.all((_.isString(sectors) ? [sectors] : sectors).map(function(sector){
                        return postDispatchMessage({
                            cmd: 'security-list',
                            exchange: exchange,
                            sector: sector,
                            mincap: mincap,
                            maxcap: maxcap
                        });
                    })).then(_.flatten);
                });
            },

            getUserProfile: function(){
                return calli.getCurrentUserAccount().then(function(iri){
                    var url = "user-profile.rq?tqx=out:table&user=" + encodeURIComponent(iri);
                    return calli.getJSON($('#queries').prop('href') + url);
                }).then(tableToObjectArray).then(function(results){
                    if (results.length) return results[0].profile;
                    else throw Error("No profile existis for current user");
                });
            },

            listIndicators: _.memoize(function(){
                return calli.getJSON($('#queries').prop('href') + 'indicator-list.rq?tqx=out:table').then(tableToObjectArray);
            }),

            listSecurityClasses: function(){
                return calli.getCurrentUserAccount().then(function(iri){
                    var url = "security-class.rq?tqx=out:table&user=" + encodeURIComponent(iri);
                    return calli.getJSON($('#queries').prop('href') + url);
                }).then(tableToObjectArray);
            },

            listScreens: function() {
                return calli.getCurrentUserAccount().then(function(iri){
                    var url = "screen-list.rq?tqx=out:table&user=" + encodeURIComponent(iri);
                    return calli.getJSON($('#queries').prop('href') + url);
                }).then(tableToObjectArray).then(function(list) {
                    return _.groupBy(list, 'iri');
                }).then(function(grouped){
                    return _.map(grouped, function(filters){
                        var signal = filters[0].forSignal;
                        return {
                            iri: filters[0].iri,
                            label: filters[0].label,
                            signal: signal.substring(signal.lastIndexOf('/') + 1),
                            forSignal: signal,
                            filters: filters
                        };
                    });
                });
            },

            resetSecurity: function(security){
                return getExchangeOfSecurity(security).then(function(exchange){
                    return postDispatchMessage({
                        cmd: 'reset',
                        exchange: exchange,
                        security: security
                    });
                });
            },

            lookup: function(symbol, exchange) {
                return getExchange(exchange).then(function(exchange){
                    return postDispatchMessage({
                        cmd: 'lookup',
                        symbol: symbol,
                        exchange: exchange
                    });
                });
            },

            load: function(security, expressions, interval, length, lower, upper) {
                if (length < 0 || length != Math.round(length)) throw Error("length must be a non-negative integer, not " + length);
                if (!interval) throw Error("interval is required, not " + interval);
                var int = interval.indexOf('/') ? interval.substring(interval.lastIndexOf('/') + 1) : interval;
                return getExchangeOfSecurity(security).then(function(exchange){
                    return postDispatchMessage({
                        cmd: 'load',
                        exchange: exchange,
                        security: security,
                        expressions: expressions,
                        interval: int,
                        length: length,
                        lower: lower,
                        upper: upper || lower
                    });
                });
            },

            /*
             * securityClasses: [{ofExchange:$iri, includes:[$ticker]}]
             * screens: [{filters:[{indicator:{expression:$expression, interval: $interval}}]}]
             * asof: new Date()
             * load:
             * * When false, don't load anything and reject on any error, but include result (if available) as warning
             * * When undefined, load if needed and treat warning as success
             * * When true, if load attempted and all loading attempts failed then error, if any (or none) loaded, treat warning as success
            */
            screen: function(securityClasses, screens, asof, until, load) {
                return inlineSecurityClasses(securityClasses).then(function(securityClasses) {
                    return inlineScreens(screens).then(function(screens){
                        return {
                            cmd: 'screen',
                            begin: asof,
                            end: until,
                            load: load,
                            securityClasses: securityClasses,
                            screens: screens
                        };
                    });
                }).then(postDispatchMessage).catch(function(data){
                    if (load !== false && data.status == 'warning')
                        return data.result;
                    else return Promise.reject(data);
                });
            },

            /*
             * securityClasses: [{ofExchange:$iri, includes:[$ticker]}]
             * entry: [{filters:[{indicator:{expression:$expression, interval: $interval}}]}]
             * exit:  [{filters:[{indicator:{expression:$expression, interval: $interval}}]}]
             * asof: new Date()
            */
            signal: function(securityClasses, entry, exit, begin, end) {
                return inlineSecurityClasses(securityClasses).then(function(securityClasses) {
                    return inlineScreens(entry).then(function(entry){
                        return inlineScreens(exit).then(function(exit){
                            return {
                                cmd: 'signal',
                                begin: begin,
                                end: end,
                                securityClasses: securityClasses,
                                entry: entry,
                                exit: exit
                            };
                        });
                    });
                }).then(postDispatchMessage).catch(function(data){
                    if (data.status == 'warning') return data.result;
                    else return Promise.reject(data);
                });
            },

            /*
             * securityClasses: [{ofExchange:$iri, includes:[$ticker]}]
             * entry: [{filters:[{indicator:{expression:$expression, interval: $interval}}]}]
             * exit:  [{filters:[{indicator:{expression:$expression, interval: $interval}}]}]
             * asof: new Date()
            */
            performance: function(securityClasses, entry, exit, begin, end) {
                return inlineSecurityClasses(securityClasses).then(function(securityClasses) {
                    return inlineScreens(entry).then(function(entry){
                        return inlineScreens(exit).then(function(exit){
                            return {
                                cmd: 'performance',
                                begin: begin,
                                end: end,
                                securityClasses: securityClasses,
                                entry: entry,
                                exit: exit
                            };
                        });
                    });
                }).then(postDispatchMessage);
            }
        });
    })(_.bindAll(createDispatch(), 'promiseMessage').promiseMessage);

    function inlineScreens(screens) {
        return Promise.all(screens.map(function(screen) {
            return screener.screenLookup()(screen).then(onlyOne(screen));
        })).then(function(screens){
            return Promise.all(screens.map(function(screen) {
                return Promise.all(screen.filters.map(function(filter){
                    var indicator = filter.indicator || filter.forIndicator;
                    return screener.indicatorLookup()(indicator).then(onlyOne(indicator)).then(function(indicator){
                        var int = indicator.hasInterval;
                        var interval = int && int.indexOf('/') ? int.substring(int.lastIndexOf('/') + 1) : int;
                        return _.extend({}, filter, {
                            indicator: _.extend({
                                interval: interval
                            }, indicator)
                        });
                    }).then(function(filter){
                        var reference = filter.hasChangeReference;
                        if (!reference) return filter;
                        return screener.indicatorLookup()(reference).then(onlyOne(reference)).then(function(reference){
                            var int = reference.hasInterval;
                            var interval = int && int.indexOf('/') ? int.substring(int.lastIndexOf('/') + 1) : int;
                            return _.extend(filter, {
                                changeReference: _.extend({
                                    interval: interval
                                }, reference)
                            });
                        })
                    });
                })).then(function(filters){
                    return _.extend({}, screen, {
                        filters: filters
                    });
                });
            }));
        });
    }

    function inlineSecurityClasses(securityClasses) {
        return Promise.all(securityClasses.map(function(hasSecurityClass) {
            return screener.securityClassLookup()(hasSecurityClass).then(onlyOne(hasSecurityClass));
        })).then(function(securityClasses) {
            return Promise.all(securityClasses.map(function(securityClass) {
                if (!securityClass.ofExchange && !securityClass.exchange) throw Error("No security class exchange: " + JSON.stringify(securityClass));
                return getExchange(securityClass.exchange || securityClass.ofExchange).then(function(exchange){
                    var s = securityClass.includeSectors;
                    var sectors = s ? _.isString(s) ? _.compact(s.split('\t')) : s : [];
                    var i = securityClass.includes;
                    var includes = i ? _.isString(i) ? _.compact(i.split(' ')) : i : [];
                    var e = securityClass.excludes;
                    var excludes = e ? _.isString(e) ? _.compact(e.split(' ')) : e : [];
                    var prefix = function(security){
                        if (security.indexOf('://') > 0) return security;
                        return exchange.iri + '/' + encodeURI(security);
                    };
                    return _.extend({}, securityClass, {
                        exchange: exchange,
                        includeSectors: sectors,
                        includes: includes.map(prefix),
                        excludes: excludes.map(prefix)
                    });
                });
            }));
        });
    }

    function getExchange(iri) {
        if (_.isObject(iri)) return Promise.resolve(iri);
        return screener.listExchanges().then(function(exchanges){
            var exchange = exchanges.reduce(function(ret, exchange){
                if (ret) return ret;
                if (exchange.iri == iri) return exchange;
            }, undefined);
            if (exchange) return exchange;
            else throw Error("Unknown exchange: " + iri);
        });
    }

    function getExchangeOfSecurity(security) {
        return screener.listExchanges().then(function(exchanges){
            var filtered = _.values(exchanges).filter(function(exchange){
                return security.indexOf(exchange.iri) === 0 && security.charAt(exchange.iri.length) == '/';
            });
            if (filtered.length == 1) return filtered[0];
            if (filtered.length) throw Error("Security matches too many exchanges: " + filtered);
            throw Error("Unknown security: " + security);
        });
    }

    function onlyOne(term) {
        return function(array) {
            if (array.length == 1)
                return array[0];
            if (array.length)
                throw Error("Too many values: " + array);
            throw Error("Missing " + JSON.stringify(term));
        };
    }

    function pad(num) {
        return (num < 10 ? '0' : '') + num;
    }

    function parseAsOf(ymd) {
        var m = ymd.match(/(\d\d\d\d)-(\d\d)-(\d\d)/);
        if (m) {
            var date = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
            date.setDate(date.getDate() + 1);
            date.setSeconds(-1); // one second before the end of the local day
            return date;
        } else {
            throw new Error("Unknown date format: " + ymd);
        }
    }

    function tableToObjectArray(table){
        return table.rows.map(function(row){
            return _.object(table.columns, row);
        });
    }

    function createDispatch() {
        var url = "ws://localhost:1880/";
        try {
            url = window.localStorage.getItem("socket") || url;
        } catch (e) {
            if (console) console.error(e);
        }
        var dispatch = {
            counter: 0,
            outstanding: {}
        };
        dispatch.open = function(){
            return dispatch.openPromise = (dispatch.openPromise || Promise.reject()).catch(function(){
                var socket, buffer;
                return new Promise(function(callback){
                    socket = new WebSocket(url);
                    socket.addEventListener("close", function() {
                        dispatch.openPromise = null;
                    });
                    socket.addEventListener("open", callback);
                    socket.addEventListener("message", function(event) {
                        buffer = buffer ? buffer + event.data : event.data;
                        while (buffer.indexOf('\n\n') > 0) {
                            var idx = buffer.indexOf('\n\n') + 2;
                            var json = buffer.substring(0, idx);
                            buffer = buffer.substring(idx);
                            Promise.resolve(json).then(JSON.parse.bind(JSON)).then(function(data){
                                var id = data.id;
                                var pending = dispatch.outstanding[id];
                                if (id && pending) {
                                    if (!data || data.status == 'success' || data.status === undefined) {
                                        if (data && data.result) {
                                            pending.resolve(data.result);
                                        } else {
                                            pending.resolve(data);
                                        }
                                    } else {
                                        pending.reject(data);
                                    }
                                } else {
                                    throw Error("Unknown WebSocket message");
                                }
                            }).catch(function(error){
                                console.log("Unknown WebSocket message", error);
                                _.each(dispatch.outstanding, function(pending, id) {
                                    pending.reject(error);
                                });
                            });
                        }
                    });
                }).then(function(){
                    console.log("Connected to", url);
                    _.each(dispatch.outstanding, function(pending, id) {
                        socket.send(JSON.stringify(pending.data) + '\n\n');
                    });
                    return socket;
                });
            });
        };
        dispatch.promiseMessage = function(data) {
            return dispatch.open().then(function(socket){
                var id = ++dispatch.counter;
                return new Promise(function(resolve, reject){
                    dispatch.outstanding[id] = {
                        request: data,
                        resolve: resolve,
                        reject: reject
                    };
                    if (data && _.isObject(data)) {
                        data.id = id;
                    } else if (data) {
                        data = {cmd: data, id: id};
                    } else {
                        throw Error("Empty message: " + data);
                    }
                    socket.send(JSON.stringify(data) + '\n\n');
                }).then(function(resolved){
                    dispatch.outstanding[id].response = resolved;
                    delete dispatch.outstanding[id];
                    return resolved;
                }, function(rejected){
                    dispatch.outstanding[id].response = rejected;
                    delete dispatch.outstanding[id];
                    return Promise.reject(rejected);
                });
            });
        };
        return dispatch;
    }

    function suffixScale(getScaleSuffix, number) {
        var num = parseFloat(number);
        if (num === 0.0)
            return '' + num;
        var abs = Math.abs(num);
        var sign = num == abs ? '' : '-';
        var scale = Math.floor(Math.log(abs)/Math.log(10) / 3) * 3;
        var suffix = getScaleSuffix(scale);
        var pow = Math.pow(10, Math.abs(scale));
        if (scale >= 3) return sign + (abs / pow) + suffix;
        if (scale <= -6) return sign + (abs * pow) + suffix;
        return '' + num;
    }

    function getScaleSuffix (scale) {
        var metric = {
            'sept':24,
            'sext':21,
            'quint':18,
            'quadr':15,
            'tri':12,
            'bi':9,
            'M':6,
            'k':3,
            'h':2,
            'da':1,
            '':0,
            'd':-1,
            'c':-2,
            'm':-3,
            'µ':-6,
            'n':-9,
            'p':-12,
            'f':-15,
            'a':-18,
            'z':-21,
            'y':-24
        };
        var idx = _.indexOf(_.values(metric), scale);
        if (idx >= 0) {
            return _.keys(metric)[idx];
        } else {
            return 'e' + scale;
        }
    }

    function synchronized(func) {
        var promise = Promise.resolve();
        return function(/* arguments */) {
            var context = this;
            var args = arguments;
            return promise = promise.catch(function() {
                // ignore previous error
            }).then(function() {
                return func.apply(context, args);
            });
        };
    }

})(jQuery);
