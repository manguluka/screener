// security.js
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
    return Promise.resolve(new Date()).then(function(now){
        return Promise.resolve().then(function(){
            return window.location.href.substring(0, window.location.href.indexOf('?'));
        }).then(function(security){
            return setTitleToSecurity(security).then(function(){
                return drawOhlcChartData(security, now);
            }).then(function(){
                return drawDailySecurityData(security, now);
            }).then(function(){
                return window.location.hash.indexOf('#!') === 0 && window.location.hash.substring(2);
            }).then(function(screen){
                return drawScreenData(security, screen, now);
            });
        });
    }).catch(calli.error);

    function setTitleToSecurity(security) {
        return screener.listExchanges().then(function(result){
            return result.filter(function(exchange){
                return window.location.href.indexOf(exchange.iri) === 0;
            })[0];
        }).then(function(exchange){
            var ticker = security.substring(exchange.iri.length + 1);
            $('title').text(ticker + ' / ' + exchange.label);
            $('#page-title').text(ticker);
            return security;
        });
    }

    function drawOhlcChartData(security, now) {
        var interval = screener.getItem("security-chart-interval", 'm60');
        var chart = d3.chart().width(document.documentElement.clientWidth).height(800).xPlot('asof');
        var since = moment().subtract(Math.max(+screener.getItem("security-chart-duration", 30*24*60*60*1000), 24*60*60*1000), 'ms').toDate();
        chart.x(chart.x().domain([since, now]));
        chart.series("volume", d3.chart.series.bar('volume').y(d3.scale.linear().range(chart.y().range())));
        chart.series("price", d3.chart.series.ohlc('open', 'high', 'low', 'close'));
        $(window).resize(function(){
            chart.width(document.documentElement.clientWidth);
            d3.select('#ohlc-div').call(chart);
        });
        chart.series("poc poc0", d3.chart.series.line('POC(12)').xPlot('asof').datum([]));
        chart.series("band band0", d3.chart.series.band('HIGH_VALUE(12)', 'LOW_VALUE(12)').xPlot('asof').datum([]));
        chart.series("poc poc1", d3.chart.series.line('POC(16)').xPlot('asof').datum([]));
        chart.series("band band1", d3.chart.series.band('HIGH_VALUE(16)', 'LOW_VALUE(16)').xPlot('asof').datum([]));
        chart.series("poc poc2", d3.chart.series.line('POC(64)').xPlot('asof').datum([]));
        chart.series("band band2", d3.chart.series.band('HIGH_VALUE(64)', 'LOW_VALUE(64)').xPlot('asof').datum([]));
        chart.series("poc poc3", d3.chart.series.line('POC(20)').xPlot('asof').datum([]));
        chart.series("band band3", d3.chart.series.band('HIGH_VALUE(20)', 'LOW_VALUE(20)').xPlot('asof').datum([]));
        var loaded = now;
        var redrawCounter = 0;
        var redraw = _.debounce(function(){
            var begin = chart.x().invert(0);
            var end = chart.x().invert(chart.innerWidth());
            var data = chart.datum();
            var i = Math.max(Math.min(_.sortedIndex(data, {asof: begin}, 'asof'), data.length-10),0);
            var j = Math.max(Math.min(_.sortedIndex(data, {asof: end}, 'asof'), data.length-1),0);
            var x = _.compose(chart.x(), chart.xPlot());
            var width = x(data[j], j) - x(data[i], i);
            var int = optimalInterval(interval, j - i, width);
            screener.setItem("security-chart-interval", interval);
            if (j > i) screener.setItem("security-chart-length", j - i);
            if (begin.valueOf() < end.valueOf()) screener.setItem("security-chart-duration", end.valueOf() - begin.valueOf());
            if (!data.length || int != interval ||
                    begin.valueOf() < data[0].asof.valueOf() ||
                    loaded.valueOf() < end.valueOf()) {
                var counter = ++redrawCounter;
                drawing = drawing.then(function(){
                    if (counter != redrawCounter) return;
                    var length = estimateDataLength((j - i) / width * chart.innerWidth(), interval, int) + 100;
                    console.log("Loading", int, length || data.length, begin);
                    return loadChartData(chart, security, int, length || data.length, end).then(function(){
                        interval = int;
                        loaded = end;
                        d3.select('#ohlc-div').call(chart);
                        redraw(); // check if more adjustments are needed
                    }, function(error){
                        calli.error(error);
                    });
                });
            }
        }, 500);
        var length = Math.max(+screener.getItem("security-chart-length", 256), 10);
        var drawing = loadChartData(chart, security, interval, length, now).then(function(){
            var data = chart.datum();
            if (chart.x()(data[Math.round(data.length/2)].asof) < 0) {
                chart.x(chart.x().domain([data[0].asof, data[data.length-1].asof]));
            }
            return data;
        }).then(function(){
            return screener.load(security, ['close'], 'd1', 1, now);
        }).then(function(data){
            chart.rule(data[0].close);
        }).then(function(){
            d3.select('#ohlc-div').call(chart);
            redraw();
        });
        chart.zoomend(redraw);
    }

    function loadChartData(chart, security, interval, length, end) {
        var earliest = {asof: new Date()};
        return screener.load(security, ['asof', 'low', 'open', 'close', 'high', 'volume'], interval, length, end).then(function(data){
            if (data.length) earliest.asof = data[0].asof;
            chart.series("volume").y().domain([_.min(data, 'volume').volume, _.max(data, 'volume').volume]);
            chart.datum(data);
            var ppp = chart.innerWidth()/data.length;
            if (interval.charAt(0) == 'm') {
                var m = parseInt(interval.substring(1), 10);
                chart.scaleExtent([Math.min(m/(30 * 60) /ppp*5,1), Math.max(m/1 /ppp*5,1)]);
            } else {
                var d = parseInt(interval.substring(1), 10);
                chart.scaleExtent([Math.min(d/5 /ppp*5,1), Math.max(d*6.5*60 /ppp*5,1)]);
            }
        }).then(function(){
            if (interval.charAt(0) != 'm' || 10 < +interval.substring(1)) return [];
            return screener.load(security, ['asof',
                'POC(12)','HIGH_VALUE(12)','LOW_VALUE(12)'
            ], 'm10', Math.max(estimateDataLength(length, interval, 'd1'), length), end);
        }).then(function(data){
            return data.slice(Math.max(_.sortedIndex(data, earliest, 'asof')-1,0));
        }).then(function(data){
            chart.series("poc poc0").datum(data);
            chart.series("band band0").datum(data);
        }).then(function(){
            if (interval.charAt(0) != 'm' || 60 < +interval.substring(1)) return [];
            return screener.load(security, ['asof',
                'POC(16)','HIGH_VALUE(16)','LOW_VALUE(16)'
            ], 'm30', Math.max(estimateDataLength(length, interval, 'd1'), length), end);
        }).then(function(data){
            return data.slice(Math.max(_.sortedIndex(data, earliest, 'asof')-1,0));
        }).then(function(data){
            chart.series("poc poc1").datum(data);
            chart.series("band band1").datum(data);
        }).then(function(){
            if (interval.charAt(0) != 'm') return [];
            return screener.load(security, ['asof',
                'POC(64)','HIGH_VALUE(64)','LOW_VALUE(64)'
            ], 'm60', Math.max(estimateDataLength(length, interval, 'd1'), length), end);
        }).then(function(data){
            return data.slice(Math.max(_.sortedIndex(data, earliest, 'asof')-1,0));
        }).then(function(data){
            chart.series("poc poc2").datum(data);
            chart.series("band band2").datum(data);
        }).then(function(){
            return screener.load(security, ['asof',
                'POC(20)','HIGH_VALUE(20)','LOW_VALUE(20)'
            ], 'd1', Math.max(estimateDataLength(length, interval, 'd1'), length), end);
        }).then(function(data){
            return data.slice(Math.max(_.sortedIndex(data, earliest, 'asof')-1,0));
        }).then(function(data){
            chart.series("poc poc3").datum(data);
            chart.series("band band3").datum(data);
        }).then(function(){
            console.log("Loaded", interval, chart.datum().length, chart.datum()[0] && chart.datum()[0].asof);
        });
    }

    function optimalInterval(interval, size, width) {
        var intervals = ['m1','m5','m10','m30','m60','m120','d1','d5'];
        var IntervalMinutes = intervals.map(function(interval){
            if (interval.charAt(0) == 'm') {
                return parseInt(interval.substring(1), 10);
            } else {
                var d = parseInt(interval.substring(1), 10);
                return d * 900;
            }
        });
        if (!size) return interval;
        var index = intervals.indexOf(interval);
        var minutes = size * IntervalMinutes[intervals.indexOf(interval)];
        var i = _.sortedIndex(IntervalMinutes, Math.round(minutes / width) * 5);
        var j = Math.min(Math.max(i, index - 1, 0), index + 1, intervals.length-1);
        return intervals[j];
    }

    function estimateDataLength(length, interval, newInterval) {
        var a = +interval.substring(1) * (interval.charAt(0) == 'd' ? 900 : 1);
        var b = +newInterval.substring(1) * (newInterval.charAt(0) == 'd' ? 900 : 1);
        return Math.ceil(length * a / b);
    }

    function drawDailySecurityData(security, now) {
        var columns = ['date(asof)', 'low', 'open', 'close', 'high'];
        return loadGoogle().then(function(){
            return screener.load(security, columns, 'd1', 125, now);
        }).then(function(data) {
            return data.map(function(result) {
                return columns.map(function(columns){
                    return result[columns];
                });
            });
        }).then(function(rows){
            $(window).resize(drawPriceChart.bind(this, rows));
            drawPriceChart(rows);
        });
    }

    function drawScreenData(security, screen, now) {
        return loadGoogle().then(function(){
            return screener.listScreens().then(function(screens){
                return screens.filter(function(scr){
                    return scr.iri == screen;
                }).map(function(screen){
                    return screen.filters.map(function(filter){
                        return filter.forIndicator;
                    });
                });
            }).then(_.flatten);
        }).then(function(indicators){
            return screener.listIndicators().then(function(indicators){
                return _.indexBy(indicators, 'iri');
            }).then(function(indicatorsByIri){
                return indicators.map(function(indicator) {
                    return indicatorsByIri[indicator];
                });
            }).then(_.compact).then(_.uniq);
        }).then(function(indicators){
            return _.groupBy(indicators, function(indicator){
                var int = indicator.hasInterval;
                return int.substring(int.lastIndexOf('/') + 1);
            });
        }).then(function(indicators){
            return Promise.all(_.keys(indicators).sort(function(i1, i2){
                if (i1 == i2) return 0;
                if (i1 == 'annual') return -1;
                if (i2 == 'annual') return 1;
                if (i1 == 'quarter') return -1;
                if (i2 == 'quarter') return 1;
                if (i1.charAt(0) < i2.charAt(0)) return -1;
                if (i1.charAt(0) > i2.charAt(0)) return 1;
                var n1 = parseInt(i1.substring(1), 10);
                var n2 = parseInt(i2.substring(1), 10);
                return n2 - n1;
            }).map(function(interval){
                var id = interval + '-div';
                $('#candlestick-div').after($('<div></div>', {
                    id: id
                }));
                var expressions = indicators[interval].map(function(indicator){
                    return indicator.expression;
                });
                var columns = ['date(asof)'].concat(expressions);
                return screener.load(security, columns, interval, 125, now).then(function(results){
                    $(window).resize(drawIndicatorCharts.bind(this, id, indicators[interval], results));
                    drawIndicatorCharts(id, indicators[interval], results);
                });
            }));
        });
    }

    function loadGoogle() {
        return new Promise(function(resolve, reject) {
            google.load('visualization', '1.0', {
                packages: ['corechart'],
                callback: resolve
            });
        });
    }

    function drawPriceChart(rows) {
        var table = new google.visualization.DataTable();
        table.addColumn('date', 'Day');
        table.addColumn('number', 'Price');
        table.addColumn('number');
        table.addColumn('number');
        table.addColumn('number');
        if (_.isArray(rows)) {
            table.addRows(rows);
        } else {
            console.log(rows);
        }
        google.visualization.drawChart({
            "containerId": "candlestick-div",
            "dataTable": table,
            "chartType": "ComboChart",
            "options": {
                seriesType: "line",
                series: {0: {type: "candlesticks"}},
                chartArea: {top: '0.5em', right: 0, width: '80%', height: '90%'},
                legend: {position: 'none'},
                candlestick: {
                    hollowIsRising: true,
                    fallingColor: {
                        strokeWidth: 1
                    },
                    risingColor: {
                        strokeWidth: 1
                    }
                },
                height: 400,
                width: window.innerWidth
            }
        });
    }

    function drawIndicatorCharts(containerId, indicators, results){
        var colours = ["#3366cc","#dc3912","#ff9900","#109618","#990099","#0099c6","#dd4477","#66aa00","#b82e2e","#316395","#994499","#22aa99","#aaaa11","#6633cc","#e67300","#8b0707","#651067","#329262","#5574a6","#3b3eac","#b77322","#16d620","#b91383","#f4359e","#9c5935","#a9c413","#2a778d","#668d1c","#bea413","#0c5922","#743411"];
        indicators.forEach(function(indicator, counter){
            var id = indicator.expression.replace(/\W+/g, '_') + '-' + containerId;
            if (!$('#' + id).length){
                $('#' + containerId).append($('<div></div>', {
                    id: id
                }));
            }
            var table = new google.visualization.DataTable();
            table.addColumn('date', 'Day');
            table.addColumn('number', indicator.label);
            table.addRows(results.map(function(result){
                return [result['date(asof)'], result[indicator.expression]];
            }));
            google.visualization.drawChart({
                "containerId": id,
                "dataTable": table,
                "chartType": "ComboChart",
                "options": {
                    seriesType: results.length > 20 ? "line" : "bars",
                    chartArea: {width: '80%', height: '90%'},
                    colors: colours.slice(counter % colours.length, colours.length),
                    height: 200,
                    width: window.innerWidth
                }
            });
        });
    }
});