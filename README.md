### web前端获取经纬度定位
在一般情况下，我们使用手机软件的时候，都是安卓或者IOS开发的应用，我们可以直接开启gps获取定位，非常方便。但是在实际的工作中，
我们有时候因为项目需求，不使用原生APP开发，而是使用传统的web开发。甚至有时候我们的计算机桌面也要使用定位，那么就要使用
javascript来实现获取定位了。本插件就是为了解决web前端定位问题。

#### 安装
```bash
npm i xiaosongshu-location
```
使用示例
```javascript

import {Location} from "xiaosongshu-location/src/Location";

Location.getGeoLocation().then(res=>{
    console.log(res);
})

```
打印结果如下：
```text
{
    // 经度
    "longitude": 106.5577,
    // 纬度
    "latitude": 29.5603,
    // 精确度（米）
    "accuracy": 10000,
    // 定位方式
    "source": "IP",
    // 时间戳
    "timestamp": 1755513150744,
    // 所属城市
    "city": "Chongqing",
    // 所属国家
    "country": "CN",
    // 网络类型
    "net": "4g_IP",
    // 网络类型
    "networkType": "WiFi/有线网络",
    // 运营商
    operator: "中国电信"   
}
```
本插件支持ip定位，gps定位和html定位。优先级是gps定位>ip定位>html定位。但是gps定位需要依赖gps设备。