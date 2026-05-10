// 初始化高德地图
// WGS84 转 GCJ02
function wgs84ToGcj02(lng, lat) {
    var a = 6378245.0;
    var ee = 0.00669342162296594323;
    function transformLat(x, y) {
        var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
        ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
        ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
        ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
        return ret;
    }
    function transformLng(x, y) {
        var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
        ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
        ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
        ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
        return ret;
    }
    var dLat = transformLat(lng - 105.0, lat - 35.0);
    var dLng = transformLng(lng - 105.0, lat - 35.0);
    var radLat = lat / 180.0 * Math.PI;
    var magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
    return [lng + dLng, lat + dLat];
}


// 初始化高德地图
var map = new AMap.Map('map', {
    center: [120.5, 30.2],
    zoom: 8,
    layers: [
        new AMap.TileLayer.Satellite(),
        new AMap.TileLayer.RoadNet()
    ],
    viewMode: '2D',
    resizeEnable: true
});

// 初始化后先隐藏面板和底部按钮，等导入窗口关闭后再显示
document.getElementById('story-panel').style.display = 'none';
document.getElementById('chapter-nav').style.display = 'none';
document.getElementById('layer-control').style.display = 'none';

var currentChapter = 1;
var polyline = null;
var markers = [];
var currentInfoWindow = null;   // 记录当前打开的弹窗

// 加载数据
var storyData;
fetch('data/xuxiake.json')
    .then(function(res) { return res.json(); })
    .then(function(data) {
        storyData = data;
        // 不自动加载章节，等待用户点击导入按钮
    })
    .catch(function(err) { console.error('数据加载失败：', err); });

// ---------- 图标汉字判断 ----------
function getMarkerIcon(point) {
    if (point.icon) return point.icon;
    var name = point.name || '';
    var desc = point.desc || '';
    if (desc.indexOf('故乡') !== -1 || desc.indexOf('起点') !== -1 || desc.indexOf('出发') !== -1) return '起';
    if (desc.indexOf('归葬') !== -1 || desc.indexOf('安葬') !== -1) return '葬';
    if (desc.indexOf('终点') !== -1 || desc.indexOf('极边') !== -1) return '终';
    if (name.indexOf('山') !== -1) return '山';
    if (name.indexOf('洞') !== -1 || desc.indexOf('洞') !== -1) return '洞';
    if (name.indexOf('江') !== -1 || name.indexOf('湖') !== -1 || name.indexOf('海') !== -1 || name.indexOf('溪') !== -1) return '水';
    return '城';
}

function createMarkerContent(point) {
    var char = getMarkerIcon(point);
    return '<div style="width:32px;height:32px;background-color:#C94F4F;border:2px solid #C8A87C;border-radius:50%;color:#F5EAD6;font-size:16px;font-weight:bold;line-height:30px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.5);font-family:SimSun,serif;">' + char + '</div>';
}


// ---------- 章节加载 ----------
function loadChapter(chapterId) {
    // 切换章节时关闭可能打开的弹窗
if (currentInfoWindow) {
    currentInfoWindow.close();
}
    var chapter = storyData.chapters.find(function(ch) { return ch.id === chapterId; });
    if (!chapter) return;

    if (polyline) { map.remove(polyline); polyline = null; }
    map.remove(markers);
    markers = [];

    var pathCoordinates = [];

    // 路线（纯红虚线）
    if (chapter.route && chapter.route.length > 1) {
        var path = chapter.route.map(function(coord) {
            var lngLat = [coord[1], coord[0]];
            pathCoordinates.push(lngLat);
            return lngLat;
        });
        polyline = new AMap.Polyline({
            path: path,
            strokeColor: '#ff0000',
            strokeWeight: 4,
            strokeOpacity: 0.9,
            strokeStyle: 'dashed',
            strokeDasharray: [10, 6]
        });
        map.add(polyline);
    }

    // 标记
    chapter.points.forEach(function(p) {
        var lngLat = [p.coords[1], p.coords[0]];
        pathCoordinates.push(lngLat);
        var marker = new AMap.Marker({
            position: lngLat,
            offset: new AMap.Pixel(-16, -16),
            content: createMarkerContent(p),
            zIndex: 120
        });
        marker.setMap(map);
        marker.on('click', (function(marker, point) {
    return function() {
        // 构建美观的古籍风信息窗
        var content = '' +
            '<div style="max-width:360px;min-width:280px;margin:0;padding:0;font-family:\'SimSun\',\'宋体\',serif;color:#E8DDCC;background:rgba(28,26,23,0.95);border-radius:8px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.6);">' +
                '<div style="background:#C94F4F;padding:8px 12px;text-align:center;">' +
                    '<strong style="font-size:16px;color:#F5EAD6;letter-spacing:2px;">' + point.name + '</strong>' +
                '</div>' +
                '<div style="padding:10px 14px;border-left:3px solid #C8A87C;margin:8px 12px;background:rgba(0,0,0,0.3);border-radius:3px;">' +
                    '<p style="font-size:13px;line-height:1.7;color:#E0D7C6;margin:0;">' + point.desc + '</p>' +
                '</div>';

        if (point.image) {
    content += '<div style="padding:0 12px 10px;text-align:center;">' +
        '<img src="' + point.image + '" style="width:99%;height:auto;display:block;margin:0 auto;border-radius:4px;border:1px solid #5A5040;box-shadow:0 4px 12px rgba(0,0,0,0.4);" />' +
        '</div>';
}
        if (point.video) {
            content += '<div style="padding:0 12px 12px;">' +
                '<video controls style="width:99%;border-radius:4px;border:1px solid #5A5040;">' +
                    '<source src="' + point.video + '" type="video/mp4">' +
                    '您的浏览器不支持视频播放。' +
                '</video>' +
                '</div>';
        }

        content += '<div style="height:3px;background:linear-gradient(90deg, #C94F4F, #C8A87C, #C94F4F);margin-top:6px;"></div>' +
            '</div>';

        // 关闭之前的弹窗
if (currentInfoWindow) {
    currentInfoWindow.close();
}

var infoWindow = new AMap.InfoWindow({
    content: content,
    offset: new AMap.Pixel(0, -32),
    autoMove: true,
    isCustom: true,
    closeWhenClickMap: true
});
infoWindow.open(map, marker.getPosition());
currentInfoWindow = infoWindow;   // 记住当前弹窗

// 弹窗关闭时暂停视频，并清除全局引用
infoWindow.on('close', function() {
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
        videos[i].pause();
    }
    currentInfoWindow = null;
});
        // 弹窗关闭时暂停视频，避免声音继续播放
infoWindow.on('close', function() {
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
        videos[i].pause();
    }
});
    };
})(marker, p));
        markers.push(marker);
    });

    // 视野
    if (pathCoordinates.length > 0) {
        var lngs = pathCoordinates.map(function(c) { return c[0]; });
        var lats = pathCoordinates.map(function(c) { return c[1]; });
        var minLng = Math.min.apply(null, lngs);
        var maxLng = Math.max.apply(null, lngs);
        var minLat = Math.min.apply(null, lats);
        var maxLat = Math.max.apply(null, lats);
        var bounds = new AMap.Bounds(
            new AMap.LngLat(minLng, minLat),
            new AMap.LngLat(maxLng, maxLat)
        );
        map.setBounds(bounds, false, [110, 110, 130, 100]);
    } else {
        map.setZoomAndCenter(chapter.zoom, [chapter.center[1], chapter.center[0]]);
    }

    // 面板
    // 构建面板正文（年代 + 描述 + 可能存在的插图）
var panelHtml = '<p class="story-paragraph"><strong>' + chapter.years + '</strong>  ' + chapter.description + '</p>';

// 如果章节有面板插图，追加图片
if (chapter.panelImage) {
    panelHtml += '<div style="text-align:center;margin:6px 0 2px;">' +
        '<img src="' + chapter.panelImage + '" style="width:90%;max-width:320px;border-radius:6px;border:1px solid #5A5040;box-shadow:0 4px 12px rgba(0,0,0,0.4);" />' +
        '</div>';
}

document.getElementById('story-text').innerHTML = panelHtml;
document.getElementById('story-quote').innerHTML = '<div class="story-quote">' + chapter.quote + '</div>';

    // 按钮状态
    document.querySelectorAll('.chapter-btn').forEach(function(btn) { btn.classList.remove('active'); });
    var activeBtn = document.querySelector('.chapter-btn[data-chapter="' + chapterId + '"]');
    if (activeBtn) activeBtn.classList.add('active');
}

// ---------- 图层切换 ----------
document.querySelectorAll('.layer-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
        document.querySelectorAll('.layer-btn').forEach(function(b) { b.classList.remove('active'); });
        e.target.classList.add('active');
        var layer = e.target.dataset.layer;
        if (layer === 'satellite') {
            map.setLayers([new AMap.TileLayer.Satellite(), new AMap.TileLayer.RoadNet()]);
        } else {
            map.setLayers([new AMap.TileLayer()]);
        }
    });
});

// ---------- 章节按钮 ----------
document.querySelectorAll('.chapter-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
        var chap = parseInt(e.target.dataset.chapter);
        if (chap !== currentChapter) {
            currentChapter = chap;
            loadChapter(chap);
        }
    });
});

// ---------- 导入窗口交互 ----------
var introModal = document.getElementById('intro-modal');
var introBtn = document.getElementById('intro-btn');

introBtn.addEventListener('click', function() {
    // 1. 隐藏导入窗口
    introModal.style.display = 'none';

    // 2. 显示故事面板和章节按钮（确保它们可见）
    document.getElementById('story-panel').style.display = 'block';
    document.getElementById('chapter-nav').style.display = 'flex';
    document.getElementById('layer-control').style.display = 'flex';

    // 3. 地图飞到第一章起点（江阴）
    map.setZoomAndCenter(8, [120.26, 31.91], false, 800);

    // 4. 加载第一章内容
    loadChapter(1);
});