// screen.js
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

jQuery(function($){

    new MutationObserver(function(){
        checkIndicators();
        $('#filters').find('.typeahead:not(.tt-hint)').last().focus();
    }).observe(document.getElementById('filters'), { childList: true });
    checkIndicators();

    $('#backtesting-list').typeahead(null, {
        name: 'watch-list',
        displayKey: 'label',
        source: screener.watchListLookup()
    }).on('change typeahead:selected typeahead:autocompleted', function(event){
        var group = $(event.target).closest('.form-group');
        group.removeClass('has-success has-warning has-error');
        screener.watchListLookup()(event.target.value).then(function(suggestions){
            if (suggestions.length == 1) {
                group.addClass('has-success');
                screener.setItem('screen-backtest-list', event.target.value);
            } else if (suggestions.length) {
                group.addClass('has-warning');
            } else {
                group.addClass('has-error');
            }
        }).catch(calli.error);
    });
    $('#backtesting-list').val(screener.getItem('screen-backtest-list'));
    $('#backtesting-asof').change(function(event){
        if (event.target.value) {
            screener.setBacktestAsOfDateString(event.target.value);
        }
    }).val(screener.getBacktestAsOfDateString());

    $('#backtesting-form').submit(function(event){
        event.preventDefault();
        screener.watchListLookup()($('#backtesting-list').val()).then(function(suggestions) {
            if (suggestions.length != 1)
                return;
            backtest(suggestions[0]);
        }).catch(calli.error);
    }).submit();

    $('#screen-form').submit(function(event){
        var prefix = $(this).attr('resource') || '';
        $('[rel="screener:hasFilter"]').each(function(){
            var indicator = $(this).find('[rel="screener:forIndicator"]').attr("resource");
            if (indicator) {
                $(this).attr("resource", prefix + "#" + localPart(indicator));
            } else {
                $(this).remove();
            }
        });
    });

    function backtest(list) {
        var asof = screener.getBacktestAsOf();
        if (_.isEmpty(list)) return;
        screener.listExchanges().then(function(exchanges){
            return readFilters($('[rel="screener:hasFilter"]').toArray()).then(function(filters){
                return screener.screen([list], [{filters: filters}], asof).then(function(result){
                    $('#results').empty().append(
                        $('<thead></thead>').append(
                            $('<tr></tr>').append(
                                $('<th></th>').text('Symbol')
                            ).append(_.map(filters, function(filter){
                                return $('<th></th>').text(filter.indicator.label);
                            }))
                        )
                    ).append(
                        $('<tbody></tbody>').append(_.map(_.sortBy(result, function(point){
                            return point.security;
                        }), function(point){
                            var exchange = exchanges.filter(function(exchange){
                                return point.security.indexOf(exchange.iri) === 0;
                            })[0];
                            var symbol = exchange.mic + ':' + point.security.substring(exchange.iri.length + 1);
                            return $('<tr></tr>')
                                .append($('<td></td>').append($('<a></a>',{
                                    href: point.security,
                                    target: $('#screen-form').length ? '_blank' : "_self"
                                }).text(symbol)))
                                .append(_.map(filters, function(filter) {
                                    return $('<td></td>').append($('<a></a>',{
                                        href: filter.indicator.iri + '#!' + point.security
                                    }).text(suffixScale(pceil(point[filter.indicator.expression], 3))));
                                }));
                        }))
                    );
                });
            });
        }).catch(calli.error);
    }

    function readFilters(filterElements) {
        var filtered = _.filter(filterElements, function(elem){
            return $(elem).find('[rel="screener:forIndicator"]').attr("resource");
        });
        return Promise.all(_.map(filtered, function(elem){
            var indicator = $(elem).find('[rel="screener:forIndicator"]').attr("resource");
            return screener.indicatorLookup()(indicator).then(_.first).then(function(indicator){
                return {
                    indicator: indicator,
                    min: $(elem).find('[property="screener:min"]').attr("content"),
                    max: $(elem).find('[property="screener:max"]').attr("content")
                };
            });
        })).catch(calli.error);
    }

    function checkIndicators() {
        $('#filters').find('.typeahead:not(.tt-hint):not(.tt-input)').typeahead(null, {
            name: 'indicator',
            displayKey: 'label',
            source: screener.indicatorLookup()
        }).each(function(i, input){
            var indicator = $(input).closest('[resource]')
                .find('[rel="screener:forIndicator"]').attr('resource');
            if (indicator) {
                screener.indicatorLookup()(indicator).then(_.first).then(function(indicator){
                    $(input).typeahead('val', indicator.label);
                }).catch(calli.error);
            }
        }).on('change typeahead:selected typeahead:autocompleted', function(event){
            var group = $(event.target).closest('.form-group');
            group.removeClass('has-success has-warning has-error');
            var resource = $(event.target).closest('[resource]');
            screener.indicatorLookup()(event.target.value).then(function(suggestions){
                resource.find('[rel="screener:forIndicator"]').remove();
                suggestions.forEach(function(suggestion){
                    resource.append($('<div></div>', {
                        rel: "screener:forIndicator",
                        resource: suggestion.iri
                    }));
                });
                if (suggestions.length == 1) {
                    group.addClass('has-success');
                    updateDistributionChart(event);
                } else if (suggestions.length) {
                    group.addClass('has-warning');
                } else {
                    group.addClass('has-error');
                }
            }).catch(calli.error);
        }).closest('[resource]').find(':input').focus(updateDistributionChart);
    }

    function updateDistributionChart(event){
        var resource = $(event.target).closest('[resource]');
        screener.indicatorLookup()(resource.find('.indicator.tt-input').val()).then(function(suggestions){
            if (suggestions.length != 1)
                return;
            var indicator = suggestions[0];
            return readFilters($('[rel="screener:hasFilter"]').toArray()).then(function(filters){
                return screener.watchListLookup()($('#backtesting-list').val()).then(function(suggestions) {
                    if (suggestions.length != 1)
                        return;
                    var asof = screener.getBacktestAsOf();
                    return chartDistribution("distribution-chart", filters, indicator, suggestions[0], asof);
                });
            });
        }).catch(calli.error);
    }

    function chartDistribution(id, filters, indicator, list, asof) {
        var key = {filters: filters, indicator: indicator, list: list, asof: asof};
        if (_.isEqual(key, $('#' + id).data())) return Promise.resolve();
        $('#' + id).data(key);
        return evaluateDistribution(filters, indicator, list, asof).then(function(chartOptions){
            if (_.isEqual(key, $('#' + id).data())) {
                google.visualization.drawChart(_.extend({
                    "containerId": id
                }, chartOptions));
            }
        });
    }

    function evaluateDistribution(filters, indicator, list, asof, callback) {
        return new Promise(function(callback){
            google.load('visualization', '1.0', {
                packages: ['corechart'],
                callback: callback
            });
        }).then(function(){
            var excludedFilters = _.map(filters, function(filter){
                if (filter.indicator.iri == indicator.iri) {
                    return _.omit(filter, 'min', 'max');
                } else {
                    return filter;
                }
            });
            return screener.screen([list], [{filters: excludedFilters}], asof);
        }).then(function(points){
            var data = new google.visualization.DataTable();
            data.addColumn('string', indicator.expression);
            data.addColumn('number', 'Securities');
            var values = _.pluck(points, indicator.expression);
            if (indicator.hasUnit.indexOf('discrete') >= 0) {
                var countBy = _.countBy(values, _.identity);
                var rows = _.sortBy(_.zip(_.keys(countBy), _.values(countBy)), function(row){
                    return parseInt(row[0], 10);
                });
                data.addRows(rows);
            } else {
                var min = _.min(values);
                var max = _.max(values);
                var interval = pceil((max - min) / 10, 1);
                if (interval === 0) {
                    interval = 1;
                }
                var begin = Math.floor(min / interval) * interval;
                var countBy = _.countBy(values, function(value){
                    return Math.floor((value - begin) / interval) * interval + begin;
                });
                var rows = _.map(_.sortBy(_.zip(_.map(_.keys(countBy), function(key) {
                    return parseInt(key, 10);
                }), _.values(countBy)), _.property(0)), function(row) {
                    return [suffixScale(row[0]) + ' - ' + suffixScale(row[0] + interval), row[1]];
                });
                data.addRows(rows);
            }
            return {
                containerId: "distribution-chart",
                dataTable: data,
                chartType: "ComboChart",
                options: {
                    seriesType: "bars",
                    chartArea: {right: 0, width: '90%'},
                    legend: { position: "none" },
                    title: indicator.label,
                    height: 200
                }
            };
        }).catch(calli.error);
    }

    function pceil(x, precision) {
        if (x === 0 || !_.isNumber(x))
            return x;
        var ex = Math.floor(Math.log(Math.abs(x))/Math.log(10)) - precision + 1;
        var div = Math.pow(10, Math.abs(ex));
        if (ex > 0) return Math.ceil(x / div) * div;
        if (ex < 0) return Math.ceil(x * div) / div;
        return Math.ceil(x);
    }

    var getScaleSuffix = _.memoize(function(scale) {
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
    });
    function suffixScale(number) {
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

    function localPart(uri) {
        return uri && uri.substring(uri.lastIndexOf('/') + 1);
    }
});
