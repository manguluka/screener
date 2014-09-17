// chart.js
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

(function(d3) {
    d3.chart = function() {
        var datum = [];
        var xIteratee = function(d,i){
            return i;
        };
        var series = {};
        var width = 800;
        var height = 600;
        var margin = {
            top: 10,
            left: 10,
            right: 60,
            bottom: 20
        };
        var svg = d3.selectAll([]);
        var grid = d3.selectAll([]);
        var pane = d3.selectAll([]);
        var axis = d3.selectAll([]);
        var x_orig = d3.time.scale().domain([moment().subtract('years',1).toDate(), new Date()]).range([0,width-margin.left-margin.right]);
        var x = x_orig.copy();
        var y = d3.scale.linear().domain([0,100]).range([height-margin.bottom-margin.top,0]);
        var xAxis = d3.svg.axis();
        var yAxis = d3.svg.axis().orient("right");
        var clip = 'clip-' + Math.random().toString(16).slice(2);
        var listeners = {};
        var zoom = d3.behavior.zoom().on("zoomstart", function(){
            pane.attr("class", pane.attr("class") + ' grabbing');
            if (listeners.zoomstart)
                listeners.zoomstart.apply(this, arguments);
        }).on("zoom", function(){
            scaleChart();
            if (listeners.zoom)
                listeners.zoom.apply(this, arguments);
            redraw();
        }).on("zoomend", function(){
            pane.attr("class", pane.attr("class").replace(/ grabbing/g,''));
            scaleChart();
            if (listeners.zoomend)
                listeners.zoomend.apply(this, arguments);
            chart(svg);
        });
    
        var chart = function(_svg) {
            if (!arguments.length) return svg;
            svg = _svg;
            var domain = chart.datum().map(chart.xPlot());
            svg.transition().duration(1000).tween("axis", function(){
                var x0 = chart.x().copy();
                var y0 = chart.y().copy();
                var yDomain = ydomain(x0, chart.innerWidth(), series, chart.y().domain());
                var y = y0.domain(yDomain);
                var ease = d3.ease('cubic-in-out');
                return function(t) {
                    if (chart.datum().length != domain.length) return;
                    var range = xrange(x0, domain, chart.innerWidth());
                    var x = chart.x().domain(domain).range(domain.map(function(d,i){
                        var from = x0(d);
                        var to = range[i];
                        var e = ease(t);
                        return from + (to - from) * e;
                    }));
                    y.domain(yDomain.map(function(to){
                        var from = y0.invert(y(to));
                        var e = ease(t);
                        return from + (to - from) * e;
                    }));
                    chart.x(x);
                    chart.y(y);
                    redraw();
                };
            }).each("end", function(){
                if (chart.datum().length != domain.length) return;
                var range = xrange(chart.x(),domain,chart.innerWidth());
                chart.x(chart.x().domain(domain).range(range));
                var yDomain = ydomain(x, chart.innerWidth(), series, chart.y().domain());
                chart.y(chart.y().domain(yDomain));
                redraw();
            });
            return chart;
        };
        chart.select = function() {
            return grid.select.apply(grid, arguments);
        };
        chart.selectAll = function() {
            return grid.selectAll.apply(grid, arguments);
        };
        chart.margin = function(_margin) {
            if (!arguments.length) return margin;
            mangin = _.extend(margin, _margin);
            chart.width(width);
            chart.height(height);
            return chart;
        };
        chart.width = function(_) {
            if (!arguments.length) return width;
            var innerWidth = chart.innerWidth();
            var _innerWidth = _ - margin.left - margin.right;
            x.range(x.range().map(function(point){
                return point * _innerWidth / innerWidth;
            }));
            width = _;
            svg.attr("width", width);
            pane.attr("width", width);
            chart.x(x);
            return chart;
        };
        chart.innerWidth = function(_) {
            if (!arguments.length) return width - margin.left - margin.right;
            return chart.width(_ + margin.left + margin.right);
        };
        chart.height = function(_) {
            if (!arguments.length) return height;
            height = _;
            svg.attr("height", height);
            pane.attr("height", height);
            y.range([height - margin.top - margin.bottom, 0]);
            chart.y(y);
            return chart;
        };
        chart.innerHeight = function(_) {
            if (!arguments.length) return height - margin.top - margin.bottom;
            return chart.height(_ + margin.top + margin.bottom);
        };
        chart.x = function(_x) {
            if (!arguments.length) return x;
            x = _x;
            x_orig = x.copy();
            var x_trim = x.copy();
            if (x_trim.range().length > 2) {
                var start = _.sortedIndex(x_trim.range(), 0);
                var end = _.sortedIndex(x_trim.range(), chart.innerWidth()+1);
                if (start < end - 1) {
                    x_trim.domain(x_trim.domain().slice(start, end)).range(x_trim.range().slice(start, end));
                }
            }
            zoom.x(x_trim);
            xAxis.scale(x_trim);
            return chart.y(y);
        };
        chart.y = function(_y) {
            if (!arguments.length) return y;
            y = _y;
            yAxis.scale(y);
            return chart;
        };
        chart.xAxis = function(_) {
            if (!arguments.length) return xAxis;
            xAxis = _;
            return chart;
        };
        chart.yAxis = function(_) {
            if (!arguments.length) return yAxis;
            yAxis = _;
            return chart;
        };
        chart.scaleExtent = zoom.scaleExtent.bind(zoom);
        chart.zoomstart = function(listener) {
            if (!arguments.length) return listeners.zoomstart;
            listeners.zoomstart = listener;
            return chart;
        };
        chart.zoom = function(listener) {
            if (!arguments.length) return listeners.zoom;
            listeners.zoom = listener;
            return chart;
        };
        chart.zoomend = function(listener) {
            if (!arguments.length) return listeners.zoomend;
            listeners.zoomend = listener;
            return chart;
        };
        chart.xPlot = function(_xIteratee) {
            if (!arguments.length) return xIteratee;
            xIteratee = _.iteratee(_xIteratee);
            return chart.x(x);
        };
        chart.datum = function(_datum) {
            if (!arguments.length) return datum;
            if (!Array.isArray(_datum)) throw Error("datum must be an Array");
            datum = _datum;
            return chart;
        };
        chart.visible = function() {
            var xIteratee = chart.xPlot();
            var datum = chart.datum();
            var mapped = datum.map(xIteratee);
            var start = _.sortedIndex(mapped, chart.x().invert(0));
            var end = _.sortedIndex(mapped, chart.x().invert(chart.innerWidth()+1));
            return datum.slice(start, end);
        };
        chart.series = function(cls, _) {
            if (!arguments.length) return series;
            if (arguments.length == 1) return series[cls];
            series[cls] = _.chart(chart);
            return chart.y(y);
        };
        return chart;

        function scaleChart() {
            var scale = zoom.scale();
            var offset = zoom.translate()[0];
            var datum = chart.datum() || [];
            if (datum.length) {
                var end = x_orig(chart.xPlot()(datum[datum.length-1]));
                if (end * scale + offset < chart.innerWidth()) {
                    offset = chart.innerWidth() - end * scale;
                    zoom.translate([offset, zoom.translate()[1]]);
                }
            }
            chart.x().range(x_orig.range().map(function(x){
                return x * scale + offset;
            }));
            return chart;
        }

        function redraw() {
            svg.attr("width", width);
            svg.attr("height", height);
            var clipRect = svg.select("defs rect").node();
            if (clipRect) {
                clipRect.parentElement.setAttribute("id", clip);
                d3.select(clipRect)
                    .attr("x", 0).attr("y", 0)
                    .attr("width", width - margin.left - margin.right)
                    .attr("height", height - margin.top - margin.bottom);
            }
            updateAll(svg, "g", "y axis").attr("transform", f('translate', chart.innerWidth() + margin.left, margin.top)).call(yAxis)
                .selectAll("line").attr("x1", -chart.innerWidth());
            var axis = updateAll(svg, "g", "x axis").attr("transform", f('translate', margin.left, chart.innerHeight() + margin.top)).call(xAxis);
            axis.selectAll("line").attr("y1", -chart.innerHeight());
            var x1, n1, s1,s0;
            axis.selectAll("text").each(function(d,i){
                // remove overlapping ticks
                var overlap = x1 && i > 0 && x1 > chart.x()(d);
                if (overlap && !significant(s0,s1,d.toISOString())) {
                    d3.select(this.parentElement).attr("style", "opacity:0;");
                } else {
                    if (overlap) {
                        d3.select(n1).attr("style", "opacity:0;");
                    }
                    s0 = s1;
                    s1 = moment(d).format();
                    n1 = this.parentElement;
                    x1 = chart.x()(d) + this.getComputedTextLength();
                }
            });
            grid = updateAll(svg, "g", "grid")
                .attr("transform", f('translate', margin.left, margin.top))
                .attr("clip-path", f('url', '#' + clip));
            _.each(series, function(mark, cls){
                updateAll(grid, "g", cls).call(mark);
            });
            pane = updateAll(svg, "rect", "pane")
                .attr("x", margin.left)
                .attr("y", margin.top)
                .attr("width", width - margin.left - margin.right)
                .attr("height", height - margin.top - margin.bottom)
                .call(zoom);
            return chart;
        }
    };

    d3.chart.series = {
        bar: function(iteratee) {
            iteratee = _.iteratee(iteratee);
            var series = buildSeries(function(g){
                var x = series.x(), y = series.y(), datum = series.datum(), xIteratee = series.xPlot();
                var range = x.range();
                var width = Math.max(Math.floor((range[range.length-1]-range[0]) / datum.length), 2);
                updateAll(g, "rect", "bar", datum).attr("x", function(d, i){
                    return x(xIteratee(d,i)) - width / 2;
                }).attr("y", _.compose(y, iteratee)).attr("width", width).attr("height", function(d,i){
                    return series.chart().innerHeight() - y(iteratee(d,i));
                });
            }, function(datum) {
                var values = datum.map(iteratee);
                return [_.min(values), _.max(values)];
            });
            return series;
        },
        line: function(iteratee) {
            iteratee = _.iteratee(iteratee);
            var series = buildSeries(function(g){
                var x = series.x(), y = series.y(), datum = series.datum(), xIteratee = series.xPlot();
                var line = d3.svg.line().x(_.compose(x,xIteratee)).y(_.compose(y,iteratee));
                updateAll(g, "path").datum(datum).attr("d", line);
            }, function(datum) {
                var values = datum.map(iteratee);
                return [_.min(values), _.max(values)];
            });
            return series;
        },
        band: function(high, low) {
            high = _.iteratee(high);
            low = _.iteratee(low);
            var series = buildSeries(function(g) {
                var x = series.x(), y = series.y(), datum = series.datum(), xIteratee = series.xPlot();
                var area = d3.svg.area().x(_.compose(x,xIteratee)).y0(_.compose(y,high)).y1(_.compose(y,low));
                updateAll(g, "path").datum(datum).attr("d", area);
            }, function(datum) {
                return [_.min(datum.map(low)), _.max(datum.map(high))];
            });
            return series;
        },
        ohlc: function(open, high, low, close) {
            open = _.iteratee(open);
            high = _.iteratee(high);
            low = _.iteratee(low);
            close = _.iteratee(close);
            var series = buildSeries(function(g) {
                var x = series.x(), y = series.y(), datum = series.datum(), xIteratee = series.xPlot();
                updateAll(g, "g", "ohlc", datum).each(function(d,i){
                    var ohlc = d3.select(this);
                    updateAll(ohlc, "path", "high-low").attr("d", 'M' + x(xIteratee(d,i)) + ',' + y(high(d,i)) + ' L' + x(xIteratee(d,i)) + ',' + y(low(d,i)));
                    updateAll(ohlc, "path", "close").attr("d", 'M' + x(xIteratee(d,i)) + ',' + y(close(d,i)) + ' L' + (x(xIteratee(d,i)) + 2) + ',' + y(close(d,i)));
                    updateAll(ohlc, "path", "open").attr("d", 'M' + (x(xIteratee(d,i)) - 2) + ',' + y(open(d,i)) + ' L' + x(xIteratee(d,i)) +',' + y(open(d,i)));
                    updateAll(ohlc, "title").text(xIteratee(d,i) + ' ' + low(d,i) + ' - ' + high(d,i));
                });
            }, function(datum) {
                return [_.min(datum.map(low)), _.max(datum.map(high))];
            });
            return series;
        }
    };

    function buildSeries(series, domainFn) {
        var datum, xIteratee, x, y;
        var chart = d3.chart();
        series.chart = function(_) {
            if (!arguments.length) return chart;
            chart = _;
            return series;
        };
        series.yDomain = function(xDomain) {
            if (y) return;
            var datum = series.datum();
            var xIteratee = series.xPlot();
            var mapped = datum.map(xIteratee);
            var start = _.sortedIndex(mapped, xDomain[0]);
            var end = _.sortedIndex(mapped, xDomain[xDomain.length-1]);
            var visible = datum.slice(start, end+1);
            return domainFn(visible);
        };
        series.x = function(_) {
            if (!arguments.length) return x || chart.x();
            x = _;
            return series;
        };
        series.y = function(_) {
            if (!arguments.length) return y || chart.y();
            y = _;
            return series;
        };
        series.xPlot = function(_xIteratee) {
            if (!arguments.length) return xIteratee || chart.xPlot();
            xIteratee = _.iteratee(_xIteratee);
            return series;
        };
        series.datum = function(_datum) {
            if (!arguments.length) return datum || chart.datum();
            if (!Array.isArray(_datum)) throw Error("datum must be an Array");
            datum = _datum;
            return series;
        };
        return series;
    }

    function xrange(scale, domain, width) {
        var range = scale.range();
        var d = scale.domain();
        var start = Math.min(_.sortedIndex(range, 0), range.length-2);
        var end = Math.min(_.sortedIndex(range, width), range.length-1);
        var d1 = Math.max(Math.min(_.sortedIndex(domain, d[start]), domain.length-10),0);
        var d2 = Math.min(_.sortedIndex(domain, d[end]), domain.length-1);
        var size = domain.length - d2 < 10 ? (domain.length-1 - d1) : (d2 - d1);
        var step = width / size;
        return _.range(-d1 * step, (domain.length - d1)*step, step);
    }

    function ydomain(x, width, series, domain) {
        var start = Math.min(_.sortedIndex(x.range(), 0), x.range().length-2);
        var end = Math.min(_.sortedIndex(x.range(), width), x.range().length-1);
        var xDomain = [x.domain()[start], x.domain()[end]];
        var yDomain = _.reduce(series, function(yDomain, series){
            var d = series.yDomain(xDomain);
            if (!d) return yDomain;
            if (isFinite(d[0]) && (d[0] < yDomain[0] || yDomain[0] === 0)) {
                yDomain[0] = d[0];
            }
            if (isFinite(d[1]) && (d[1] > yDomain[1] || yDomain[1] === 100)) {
                yDomain[1] = d[1];
            }
            return yDomain;
        }, [0, 100]);
        if (_.isEqual(yDomain, [0,100])) return domain;
        return yDomain;
    }

    function updateAll(chart, tag, cls, data){
        var selector = cls ? (tag + '.' + cls.replace(/ /g, '.')) : tag;
        var existing = chart.selectAll(selector).data(data || [undefined]);
        var created = existing.enter().append(tag);
        if (cls) created.attr("class", cls);
        existing.exit().remove();
        return chart.selectAll(selector);
    }

    function significant(s0,s1,s2) {
        if (!s0) return false;
        for (var i=0;i<s0.length;i++) {
            if (s0.charAt(i) != s1.charAt(i) && s1.charAt(i) == s2.charAt(i))
                return false;
            if (s0.charAt(i) != s2.charAt(i))
                return true;
            if (s0.charAt(i) != s1.charAt(i))
                return false;
        }
        return false;
    }

    function f(name) {
        return [name, '(', Array.prototype.join.call(Array.prototype.slice.call(arguments,1), ','), ')'].join('');
    }
})(d3);