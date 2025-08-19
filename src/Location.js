/**
 * @purpose 智能定位系统 - 最终修复版，解决无type属性导致的WiFi识别问题
 * @author yanglong
 * @time 2025年8月19日
 */
export class Location{
    /**
     * 主定位方法 - 智能选择定位策略
     */
    static async getGeoLocation() {
        //console.log("初始化智能定位系统...");

        // 初始化结果对象
        const result = {
            longitude: "未定位",
            latitude: "未定位",
            accuracy: Infinity,
            source: "未知",
            timestamp: Date.now(),
            city: "",
            country: "",
            operator: "未知",
            networkType: "未知",
            isWiFi: false,
            error: null
        };

        try {
            // 获取网络信息
            const networkInfo = this._getNetworkInfo();
            result.networkType = networkInfo.networkType;
            result.isWiFi = networkInfo.isWiFi;

            // 检测设备能力
            const deviceInfo = await this._detectDeviceCapabilities();

            // GPS定位
            if (deviceInfo.hasGps && deviceInfo.accuracy < 500) {
                const gpsResult = await this._getGpsLocation();
                if (gpsResult.success) {
                    return this._mergeResults(this._formatResult(gpsResult, "GPS"), networkInfo);
                }
            }

            // IP定位
            const ipResult = await this._getIpLocation();
            if (ipResult.success) {
                return this._mergeResults(this._formatResult(ipResult, "IP"), networkInfo);
            }

            // HTML5定位
            const htmlResult = await this._getHtml5Location();
            if (htmlResult.success) {
                return this._mergeResults(this._formatResult(htmlResult, "HTML5"), networkInfo);
            }

            // 所有定位方法都失败
            throw new Error("所有定位方法均失败");
        } catch (error) {
            //console.error("定位系统错误:", error);
            result.error = error.message;
            return result;
        }
    }

    /**
     * 合并定位结果和网络信息
     */
    static _mergeResults(locationResult, networkInfo) {
        return {
            ...locationResult,
            networkType: networkInfo.networkType,
            isWiFi: networkInfo.isWiFi
        };
    }

    /**
     * 优化网络类型检测（针对无type属性的浏览器修复）
     */
    static _getNetworkInfo() {
        let networkType = "未知";
        let isWiFi = false;
        let connection;

        // 兼容不同浏览器的connection属性
        if (navigator.connection) {
            connection = navigator.connection;
        } else if (navigator.mozConnection) {
            connection = navigator.mozConnection;
        } else if (navigator.webkitConnection) {
            connection = navigator.webkitConnection;
        }

        // 调试信息
        //console.log("浏览器网络连接信息:", connection);

        // 判断设备类型（桌面/移动）
        const userAgent = navigator.userAgent;
        const isDesktop = !/Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
        const isMobile = !isDesktop;

        if (connection) {
            // 处理有type属性的情况
            if (typeof connection.type !== 'undefined') {
                const wifiRelatedTypes = ['wifi', 'wlan', 'unknown', '802.11'];
                const ethernetTypes = ['ethernet', 'lan'];

                if (wifiRelatedTypes.includes(connection.type)) {
                    isWiFi = true;
                    networkType = "WiFi";
                } else if (ethernetTypes.includes(connection.type)) {
                    isWiFi = true;
                    networkType = "有线网络";
                } else {
                    // 移动网络类型判断
                    switch(connection.effectiveType) {
                        case '4g': networkType = '4G'; break;
                        case '3g': networkType = '3G'; break;
                        case '2g': networkType = '2G'; break;
                        case '5g': networkType = '5G'; break;
                        case 'slow-2g': networkType = '2G (慢速)'; break;
                        default: networkType = '移动网络';
                    }
                }
            } else {
                // 处理无type属性的情况（重点修复）
                if (isDesktop) {
                    // 桌面设备强制判定为WiFi/有线
                    isWiFi = true;
                    networkType = "WiFi/有线网络";
                } else {
                    // 移动设备按effectiveType判断
                    switch(connection.effectiveType) {
                        case '4g': networkType = '4G'; break;
                        case '3g': networkType = '3G'; break;
                        case '2g': networkType = '2G'; break;
                        case '5g': networkType = '5G'; break;
                        case 'slow-2g': networkType = '2G (慢速)'; break;
                        default: networkType = '移动网络';
                    }
                    isWiFi = false;
                }
            }
        } else {
            // 不支持connection API的情况
            if (isDesktop) {
                networkType = "WiFi/有线网络";
                isWiFi = true;
            } else {
                networkType = "移动网络";
                isWiFi = false;
            }
        }

        return { networkType, isWiFi };
    }

    /**
     * 检测设备类型和GPS可用性
     */
    static async _detectDeviceCapabilities() {
        const userAgent = navigator.userAgent;
        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
        const isTablet = /iPad|Tablet|Touch/i.test(userAgent);
        const deviceType = isMobile ? "移动设备" : (isTablet ? "平板设备" : "桌面设备");

        let hasGps = false;
        let locationAccuracy = Infinity;

        try {
            const position = await Promise.race([
                new Promise((resolve, reject) => {
                    if (!navigator.geolocation) {
                        reject(new Error("浏览器不支持定位API"));
                        return;
                    }

                    navigator.geolocation.getCurrentPosition(
                        (pos) => resolve(pos),
                        (err) => reject(err),
                        {
                            enableHighAccuracy: true,
                            timeout: 10000,
                            maximumAge: 0
                        }
                    );
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("定位超时")), 10000)
                )
            ]);

            locationAccuracy = position.coords.accuracy;
            if (isMobile) {
                hasGps = locationAccuracy < 100;
            } else if (isTablet) {
                hasGps = locationAccuracy < 200;
            } else {
                hasGps = false;
            }

        } catch (error) {
            //console.warn("GPS检测失败:", error.message);
            hasGps = false;
        }

        return {
            isMobile,
            isTablet,
            deviceType,
            hasGps,
            accuracy: locationAccuracy
        };
    }

    /**
     * GPS定位（高精度）
     */
    static async _getGpsLocation() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve({ success: false, error: "浏览器不支持地理位置API" });
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        success: true,
                        coords: position.coords
                    });
                },
                (error) => {
                    resolve({ success: false, error: error.message });
                },
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0
                }
            );
        });
    }

    /**
     * IP定位（多服务备份）
     */
    static async _getIpLocation() {
        const ipServices = [
            {
                name: "ipinfo",
                url: "https://ipinfo.io/json",
                parse: (data) => {
                    const [lat, lon] = data.loc.split(',');
                    return {
                        latitude: parseFloat(lat),
                        longitude: parseFloat(lon),
                        accuracy: 10000,
                        city: data.city,
                        country: data.country,
                        operator: data.org || "未知"
                    };
                }
            },
            {
                name: "ip-api",
                url: "http://ip-api.com/json",
                parse: (data) => ({
                    latitude: data.lat,
                    longitude: data.lon,
                    accuracy: 50000,
                    city: data.city,
                    country: data.country,
                    operator: data.isp || "未知"
                })
            },
            {
                name: "geoplugin",
                url: "https://www.geoplugin.net/json.gp",
                parse: (data) => ({
                    latitude: parseFloat(data.geoplugin_latitude),
                    longitude: parseFloat(data.geoplugin_longitude),
                    city: data.geoplugin_city,
                    country: data.geoplugin_countryName,
                    accuracy: 50000,
                    operator: "未知"
                })
            }
        ];

        for (const service of ipServices) {
            try {
                const response = await fetch(service.url, {
                    headers: { 'Accept': 'application/json' }
                });

                if (!response.ok) {
                    throw new Error(`服务响应错误: ${response.status}`);
                }

                const data = await response.json();
                const location = service.parse(data);

                return {
                    success: true,
                    ...location
                };
            } catch (error) {
                console.warn(`IP定位服务 ${service.name} 失败:`, error);
            }
        }

        return { success: false, error: "所有IP定位服务失败" };
    }

    /**
     * HTML5定位（中精度）
     */
    static async _getHtml5Location() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve({ success: false, error: "浏览器不支持地理位置API" });
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        success: true,
                        coords: position.coords
                    });
                },
                (error) => {
                    resolve({ success: false, error: error.message });
                },
                {
                    enableHighAccuracy: false,
                    timeout: 10000,
                    maximumAge: 300000
                }
            );
        });
    }

    /**
     * 格式化定位结果
     */
    static _formatResult(data, source) {
        if (!data.success) {
            return {
                longitude: "定位失败",
                latitude: "定位失败",
                accuracy: Infinity,
                source: source,
                timestamp: Date.now(),
                operator: "未知",
                error: data.error || "未知错误"
            };
        }

        if (source === "GPS" || source === "HTML5") {
            return {
                longitude: data.coords.longitude,
                latitude: data.coords.latitude,
                accuracy: data.coords.accuracy,
                source: source,
                timestamp: Date.now(),
                operator: "未知"
            };
        } else if (source === "IP") {
            return {
                longitude: data.longitude,
                latitude: data.latitude,
                accuracy: data.accuracy,
                source: source,
                timestamp: Date.now(),
                city: data.city || "",
                country: data.country || "",
                operator: this._formatOperatorName(data.operator)
            };
        }

        return data;
    }

    /**
     * 格式化运营商名称
     */
    static _formatOperatorName(operator) {
        if (!operator || operator === "未知") return "未知";

        // 处理AS号码
        if (/^AS\d+$/.test(operator)) {
            const asMap = {
                'AS4134': '中国电信',
                'AS9808': '中国移动',
                'AS4837': '中国联通',
                'AS58453': '中国广电'
            };
            return asMap[operator] || `AS号码: ${operator}`;
        }

        // 转换常见运营商名称
        const operatorMap = [
            { regex: /中国移动|China Mobile/i, name: "中国移动" },
            { regex: /中国电信|China Telecom|AS4134/i, name: "中国电信" },
            { regex: /中国联通|China Unicom|AS4837/i, name: "中国联通" },
            { regex: /中国广电|AS58453/i, name: "中国广电" }
        ];

        for (const item of operatorMap) {
            if (item.regex.test(operator)) {
                return item.name;
            }
        }

        return operator.split(/\s|-/)[0];
    }
}
