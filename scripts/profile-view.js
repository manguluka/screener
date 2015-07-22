// profile-view.js
/* 
 *  Copyright (c) 2015 James Leigh Services Inc., Some Rights Reserved
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

jQuery(function($){

    if (window.location.hash.indexOf("#socket=") === 0) {
        try {
            window.localStorage.setItem("socket", window.location.hash.substring("#socket=".length));
        } catch (e) {
            if (console) console.error(e);
        }
    }
    screener.setProfile(window.location.href).catch(console.log.bind(console));

    (function(updateWatchList){
        screener.listSecurityClasses().then(function(classes){
            return classes.map(function(indicator){
                return {
                    value: indicator.iri,
                    text: indicator.label
                };
            });
        }).then(function(options){
            $('#security-class').selectize({
                options: options,
                items: screener.getItem("security-class", '').split(' '),
                closeAfterSelect: true,
                load: function(query, callback) {
                    if (!query) callback();
                    return screener.lookup(query).then(function(securities){
                        return securities.map(function(security){
                            return {
                                text: security.ticker,
                                value: security.iri,
                                title: security.name,
                                type: security.type,
                                mic: security.exchange.mic
                            };
                        });
                    }).then(callback, function(error){
                        callback();
                        calli.error(error);
                    });
                },
                create: function(input, callback) {
                    var cls = $('#SecurityClass').prop('href');
                    var container = $('#container-resource').attr('resource') || window.location.pathname;
                    var url = container + "?create=" + encodeURIComponent(cls) + "#" + encodeURIComponent(input);
                    window.location = url;
                },
                render: {
                    option: function(data, escape) {
                        return '<div style="white-space:nowrap;text-overflow:ellipsis;" title="' +  escape(data.title) + '">' +
                            (data.title ?
                                (
                                    '<b>' + escape(data.text) + "</b> | " + escape(data.title) +
                                    ' <small class="text-muted">(' + escape(data.mic + ' ' + data.type) + ')</small>'
                                ) :
                               escape(data.text)
                            ) +
                        '</div>';
                    },
                    item: function(data, escape) {
                        if (data.title) return '<div class="" title="' + escape(data.title) + '">' + escape(data.text) + '</div>';
                        else return '<div onclick="window.location=\'' + escape(data.value) + '?view\'">' +
                            escape(data.text) + '</div>';
                    }
                }
            }).change(function(event){
                screener.setItem("security-class", ($(event.target).val() || []).join(' '));
            }).change(updateWatchList).change();
        });
        var lastWeek = new Date(new Date().toISOString().replace(/T.*/,''));
        lastWeek.setDate(lastWeek.getDate() -  screener.getItem("since-days", 5) / 5 * 7);
        $('#since').prop('valueAsDate', lastWeek).change(function(event){
            var since = event.target.valueAsDate;
            var today = new Date(new Date().toISOString().replace(/T.*/,''));
            screener.setItem("since-days", (today.valueOf() - since.valueOf()) / 1000 / 60 / 60 / 24 / 7 * 5);
        }).change(updateWatchList);
        screener.listScreens().then(function(screens){
            return screens.map(function(screen){
                return {
                    value: screen.iri,
                    text: screen.label
                };
            });
        }).then(function(options){
            $('#screen').selectize({
                options: options,
                items: screener.getItem("screen", '').split(' '),
                closeAfterSelect: true,
                create: function(input, callback) {
                    var cls = $('#Screen').prop('href');
                    var container = $('#container-resource').attr('resource') || window.location.pathname;
                    var url = container + "?create=" + encodeURIComponent(cls) + "#" + encodeURIComponent(input);
                    window.location = url;
                },
                render: {
                    item: function(data, escape) {
                        return '<div onclick="window.location=\'' + escape(data.value) + '?view\'">' +
                            escape(data.text) + '</div>';
                    }
                }
            }).change(function(event){
                screener.setItem("screen", ($(event.target).val() || []).join(' '));
            }).change(updateWatchList).change();
        });
        $('#results-table thead th').click(function(event){
            sortTable($(event.target).prevAll().length);
        }).css("cursor", "pointer");
    })(screener.debouncePromise(updateWatchList));

    function updateWatchList() {
        var securityClasses = $('#security-class').val();
        var since = $('#since').prop('valueAsDate');
        var screens = $('#screen').val();
        if (_.isEmpty(securityClasses) || _.isEmpty(screens)) return;
        var now = new Date();
        $('#results-table tbody').empty();
        return Promise.all(screens.map(function(screen){
            return screener.screen(securityClasses, screen, since, now).then(function(list){
                return list.filter(function(item){
                    return item.signal != 'stop';
                });
            }).then(function(list){
                var rows = list.map(function(item){
                    // ticker
                    return $('<tr></tr>', {
                        resource: item.security
                    }).append($('<td></td>').append($('<a></a>', {
                        href: item.security
                    }).text(decodeURIComponent(item.security.replace(/^.*\//,'')))));
                });
                $('#results-table tbody').append(rows);
                return Promise.all(list.map(function(item, i){
                    var tr = rows[i];
                    return screener.getSecurity(item.security).then(function(result){
                        return tr.append($('<td></td>').text(result && result.name || ''));
                    }).then(function(){
                        return screener.load(item.security, ['asof', 'open','high','low','close'], 'd1', 2, now);
                    }).then(function(data){
                        if (!data.length) return;
                        var close = data[data.length-1].close;
                        var previous = data.length > 1 ? data[data.length-2].close : close;
                        var change = Math.round(10000 * (close - previous) / previous) / 100;
                        var volume = data[data.length-1].volume;
                        return tr.append($('<td></td>', {
                            "class": "text-right",
                            "data-value": close
                        }).text(screener.formatCurrency(close))).append($('<td></td>', {
                            "class": (change < 0 ? "text-danger " : '') + "text-right",
                            "data-value": change
                        }).text(data.length > 1 && (change + '%') || '')).append($('<td></td>', {
                            "class": "text-right hidden-xs",
                            "data-value": volume
                        }).text(screener.formatNumber(volume)));
                    }).then(function(){
                        var lower = new Date();
                        lower.setFullYear(lower.getFullYear() - 1);
                        return screener.load(item.security, ['asof', 'open','high','low','close'], 'd5', 5, lower, now);
                    }).then(function(data){
                        var high = _.max(_.pluck(data, 'high'));
                        var low = _.min(_.pluck(data, 'low'));
                        tr.append($('<td></td>', {
                            "class": "text-right hidden-xs",
                            "data-value": high
                        }).text(screener.formatCurrency(high))).append($('<td></td>', {
                            "class": "text-right hidden-xs",
                            "data-value": low
                        }).text(screener.formatCurrency(low)));
                    }).then(function(){
                        tr.append($('<td></td>', {
                            "class": "text-right hidden-xs",
                            "data-value": item.growth
                        }).text(item.growth.toFixed(2) + '%'));
                    });
                }));
            });
        })).then(function(){
            sortTable();
        });
    }

    var lastSortedColumn;
    function sortTable(column) {
        if (column === undefined && lastSortedColumn === undefined) {
            return;
        } else if (column === undefined) {
            return sortTable(lastSortedColumn);
        } else {
            lastSortedColumn = column;
        }
        var tbody = $('#results-table tbody');
        tbody.append(tbody.children('tr').toArray().sort(function(a,b){
            var ca = $(a).children()[column];
            var cb = $(b).children()[column];
            if (!ca && !cb) {
                ca = $(a).children()[0];
                cb = $(b).children()[0];
            }
            if (!ca) return 1;
            if (!cb) return -1;
            var va = ca.getAttribute("data-value");
            var vb = cb.getAttribute("data-value");
            var ta = $(ca).text();
            var tb = $(cb).text();
            if (va || vb) return +vb - +va;
            else if (ta < tb) return -1;
            else if (ta > tb) return 1;
            else return 0;
        }));
    }
});