define(function(require) {

    'use strict';

    var zrUtil = require('zrender/core/util');

    function getSeriesStackId(seriesModel) {
        return seriesModel.get('stack') || '__ec_stack_' + seriesModel.seriesIndex;
    }

    function calBarWidthAndOffset(barSeries, api) {
        // Columns info on each category axis. Key is cartesian name
        var columnsMap = {};

        zrUtil.each(barSeries, function (seriesModel, idx) {
            var cartesian = seriesModel.coordinateSystem;

            var categoryAxis = cartesian.getAxesByScale('ordinal')[0];

            if (categoryAxis) {
                var columnsOnAxis = columnsMap[cartesian.name] || {
                    remainedWidth: categoryAxis.getBandWidth(true),
                    autoWidthCount: 0,
                    categoryGap: '20%',
                    gap: '30%',
                    axis: categoryAxis,
                    stacks: {}
                };
                var stacks = columnsOnAxis.stacks;
                columnsMap[cartesian.name] = columnsOnAxis;

                var stackId = getSeriesStackId(seriesModel);

                if (! stacks[stackId]) {
                    columnsOnAxis.autoWidthCount++;
                }
                stacks[stackId] = stacks[stackId] || {
                    width: 0,
                    maxWidth: 0
                };

                var barWidth = seriesModel.get('barWidth');
                var barMaxWidth = seriesModel.get('barMaxWidth');
                var barGap = seriesModel.get('barGap');
                var barCategoryGap = seriesModel.get('barCategoryGap');
                // TODO
                if (barWidth && ! stacks[stackId].width) {
                    barWidth = Math.min(columnsOnAxis.remainedWidth, barWidth);
                    stacks[stackId].width = barWidth;
                    columnsOnAxis.remainedWidth -= barWidth;
                }

                barMaxWidth && (stacks[stackId].maxWidth = barMaxWidth);
                barGap && (columnsOnAxis.gap = barGap);
                barCategoryGap && (columnsOnAxis.categoryGap = barCategoryGap);
            }
        });

        var result = {};

        zrUtil.each(columnsMap, function (columnsOnAxis, coordSysName) {

            result[coordSysName] = {};

            var categoryGap = columnsOnAxis.categoryGap;
            var barGapPercent = columnsOnAxis.gap;
            var categoryAxis = columnsOnAxis.axis;
            var bandWidth = categoryAxis.getBandWidth(true);
            if (typeof categoryGap === 'string') {
                categoryGap = (parseFloat(categoryGap) / 100) * bandWidth;
            }
            if (typeof (barGapPercent === 'string')) {
                barGapPercent = parseFloat(barGapPercent) / 100;
            }

            var remainedWidth = columnsOnAxis.remainedWidth;
            var autoWidthCount = columnsOnAxis.autoWidthCount;
            var autoWidth = (remainedWidth - categoryGap)
                / (autoWidthCount + (autoWidthCount - 1) * barGapPercent);
            autoWidth = Math.max(autoWidth, 0);

            // Find if any auto calculated bar exceeded maxBarWidth
            zrUtil.each(columnsOnAxis.stacks, function (column, stack) {
                var maxWidth = column.maxWidth;
                if (! column.width && maxWidth && maxWidth < autoWidth) {
                    maxWidth = Math.min(maxWidth, remainedWidth);
                    remainedWidth -= maxWidth;
                    column.width = maxWidth;
                    autoWidthCount--;
                }
            });

            // Recalculate width again
            autoWidth = (remainedWidth - categoryGap)
                / (autoWidthCount + (autoWidthCount - 1) * barGapPercent);
            autoWidth = Math.max(autoWidth, 0);

            zrUtil.each(columnsOnAxis.stacks, function (column) {
                if (! column.width) {
                    column.width = autoWidth;
                }
            });

            var offset = -bandWidth / 2 + categoryGap / 2;
            zrUtil.each(columnsOnAxis.stacks, function (column, stackId) {
                result[coordSysName][stackId] = result[coordSysName][stackId] || {
                    offset: offset,
                    width: column.width,
                    axis: columnsOnAxis.axis
                };

                offset += column.width * (1 + barGapPercent);
            });
        });

        return result;
    }

    function barLayoutGrid(ecModel, api) {

        var barWidthAndOffset = calBarWidthAndOffset(
            zrUtil.filter(
                ecModel.getSeriesByType('bar'),
                function (seriesModel) {
                    return seriesModel.coordinateSystem
                    && seriesModel.coordinateSystem.type === 'cartesian2d'
                }
            )
        );

        var lastStackCoords = {};

        ecModel.eachSeriesByType('bar', function (seriesModel) {

            var data = seriesModel.getData();
            var cartesian = seriesModel.coordinateSystem;

            var stackId = getSeriesStackId(seriesModel);
            var columnLayoutInfo = barWidthAndOffset[cartesian.name][stackId];
            var columnOffset = columnLayoutInfo.offset;
            var columnWidth = columnLayoutInfo.width;
            var projectAxis = columnLayoutInfo.axis;
            if (data.type === 'list') {
                var coords = cartesian.dataToCoords(data);
                lastStackCoords[stackId] = lastStackCoords[stackId] || [];
                data.each(function (dataItem, dataIndex) {

                    var value = dataItem.getValue();
                    // 空数据
                    if (value == null) {
                        return;
                    }

                    var coord = coords[dataIndex];
                    var lastCoord = lastStackCoords[stackId][dataIndex] || projectAxis.otherCoord;
                    var x, y, width, height;
                    if (projectAxis.isHorizontal()) {
                        x = coord[0] + columnOffset;
                        y = Math.min(lastCoord, coord[1]);
                        width = columnWidth;
                        height = Math.abs(coord[1] - lastCoord);

                        lastStackCoords[stackId][dataIndex] = y;
                    }
                    else {
                        x = Math.min(lastCoord, coord[0]);
                        y = coord[1] + columnOffset;
                        width = Math.abs(coord[0] - lastCoord);
                        height = columnWidth;
                        lastStackCoords[stackId][dataIndex] = x;
                    }
                    dataItem.layout = {
                        x: x,
                        y: y,
                        width: width,
                        height: height
                    };
                });
            }
        }, this);
    }

    require('../../echarts').registerLayout(barLayoutGrid);

    return barLayoutGrid;
});