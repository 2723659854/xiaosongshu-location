/**
 * @purpose 智能定位系统 - 自动检测设备GPS能力并选择最优定位策略
 * @author yanglong
 * @time 2025年7月15日14:54:46
 * @note
 * 1. 先尝试检测GPS可用性
 * 2. 根据结果选择GPS定位或IP定位
 * 3. 提供多级降级策略确保定位成功率
 * 4，中国大致位于东经 73°~135°、北纬 18°~53°，超过这个范围，可能用户打开了VPN 或者在国外访问
 */
export class Location{
    /**
     * 主定位方法 - 智能选择定位策略
     */
    static async getGeoLocation() {
        console.log("初始化智能定位系统...");

        // 初始化结果对象
        const result = {
            longitude: "未定位",
            latitude: "未定位",
            accuracy: Infinity,
            source: "未知",
            timestamp: Date.now(),
            city: "",
            country: "",
            error: null
        };

        try {

            // 首先使用精度最高的gps,检测设备类型和GPS可用性
            const deviceInfo = await this._detectDeviceCapabilities();
            console.log("设备信息:", deviceInfo);

            // 根据设备能力选择定位策略，必须支持gps，并且精度小于500米，才使用gps,大于500米就不如用wifi定位了
            if (deviceInfo.hasGps && deviceInfo.accuracy < 500) {
                const gpsResult = await this._getGpsLocation();
                if (gpsResult.success) {
                    console.log("gps定位")
                    return this._formatResult(gpsResult, "GPS");
                }
            }

            // 如果用户既没有安装gps，老版本浏览器也不支持定位，那就调用ip解析
            const ipResult = await this._getIpLocation();
            if (ipResult.success) {
                console.log("ip定位")
                return this._formatResult(ipResult, "IP");
            }

            // HTML5定位 理论上大多数浏览器是支持定位的，通过wifi和路由器定位
            const htmlResult = await this._getHtml5Location();
            if (htmlResult.success) {
                console.log("html定位")
                return this._formatResult(htmlResult, "HTML5");
            }



            // 所有定位方法都失败
            throw new Error("所有定位方法均失败");
        } catch (error) {
            console.error("定位系统错误:", error);
            result.error = error.message;
            return result;
        }
    }


    /**
     * 优化版：检测设备类型和GPS可用性（结合精度判断）
     */
    static async _detectDeviceCapabilities() {
        // 1. 检测设备类型（移动/PC）
        const userAgent = navigator.userAgent;
        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
        const isTablet = /iPad|Tablet|Touch/i.test(userAgent); // 区分平板
        const deviceType = isMobile ? "移动设备" : (isTablet ? "平板设备" : "桌面设备");

        // 2. 检测GPS硬件（结合定位精度判断）
        let hasGps = false;
        let locationAccuracy = Infinity; // 定位精度（米）

        try {
            // 尝试获取高精度位置（短超时）
            const position = await Promise.race([
                new Promise((resolve, reject) => {
                    if (!navigator.geolocation) {
                        reject(new Error("浏览器不支持定位API"));
                        return;
                    }

                    navigator.geolocation.getCurrentPosition(
                        (pos) => resolve(pos), // 成功获取位置
                        (err) => reject(err),  // 定位失败
                        {
                            enableHighAccuracy: true, // 要求高精度
                            timeout: 10000,            // 3秒超时（给GPS足够响应时间）
                            maximumAge: 0             // 不使用缓存
                        }
                    );
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("定位超时")), 10000)
                )
            ]);

            // 3. 关键：通过精度判断是否为真实GPS
            locationAccuracy = position.coords.accuracy; // 单位：米
            // 规则：
            // - 移动设备：精度<100米 → 认为有GPS
            // - 平板设备：精度<200米 → 认为有GPS（平板GPS精度略低）
            // - PC设备：即使有位置，也默认无GPS（PC极少配备GPS）
            if (isMobile) {
                hasGps = locationAccuracy < 100; // 手机GPS通常<100米
            } else if (isTablet) {
                hasGps = locationAccuracy < 200; // 平板GPS精度稍低
            } else {
                hasGps = false; // PC默认无GPS，无论定位是否成功
            }

        } catch (error) {
            console.warn("GPS检测失败:", error.message);
            hasGps = false;
        }

        return {
            isMobile,
            isTablet,
            deviceType,
            hasGps,
            accuracy: locationAccuracy // 返回精度，供后续定位策略参考
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
                    console.error("GPS定位错误:", error);
                    resolve({ success: false, error: error.message });
                },
                {
                    enableHighAccuracy: true,
                    timeout: 15000,  // 给GPS足够时间
                    maximumAge: 0    // 不使用缓存
                }
            );
        });
    }

    /**
     * IP定位（多服务备份）
     */
    static async _getIpLocation() {
        // 定义多个IP定位服务，按优先级排序
        const ipServices = [

            {
                name: "ipinfo",
                url: "https://ipinfo.io/json",
                parse: (data) => {
                    const [lat, lon] = data.loc.split(',');
                    return {
                        latitude: parseFloat(lat),
                        longitude: parseFloat(lon),
                        accuracy: 10000,  // ipinfo精度通常更高
                        city: data.city,
                        country: data.country
                    };
                }
            },
            {
                name: "geoplugin",
                url: "https://www.geoplugin.net/json.gp", // 支持HTTPS
                parse: (data) => ({
                    latitude: parseFloat(data.geoplugin_latitude),
                    longitude: parseFloat(data.geoplugin_longitude),
                    city: data.geoplugin_city,
                    country: data.geoplugin_countryName,
                    accuracy: 50000
                })
            },
            {
                name: "ip-api",
                url: "http://ip-api.com/json",
                parse: (data) => ({
                    latitude: data.lat,
                    longitude: data.lon,
                    accuracy: 50000,  // IP定位典型精度50km
                    city: data.city,
                    country: data.country
                })
            },
        ];

        // 尝试每个IP定位服务
        for (const service of ipServices) {
            try {
                console.log(`尝试IP定位服务: ${service.name}`);
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
                // 继续尝试下一个服务
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
                    console.error("HTML5定位错误:", error);
                    resolve({ success: false, error: error.message });
                },
                {
                    enableHighAccuracy: false,  // 不强制高精度
                    timeout: 10000,              // 10秒超时
                    maximumAge: 300000          // 5分钟缓存
                }
            );
        });
    }

    /**
     * 格式化定位结果
     */
    static _formatResult(data, source) {
        let netType = "未知";
        if (navigator.connection) {
            netType = navigator.connection.effectiveType;
        }
        if (!data.success) {
            return {
                longitude: "定位失败",
                latitude: "定位失败",
                accuracy: Infinity,
                source: source,
                timestamp: Date.now(),
                error: data.error || "未知错误",
                net:netType + "_" + source
            };
        }

        // 根据不同定位源格式化结果
        if (source === "GPS" || source === "HTML5") {
            return {
                longitude: data.coords.longitude,
                latitude: data.coords.latitude,
                accuracy: data.coords.accuracy,
                source: source,
                timestamp: Date.now(),
                net:netType + "_" + source
            };
        } else if (source === "IP") {
            return {
                longitude: data.longitude,
                latitude: data.latitude,
                accuracy: data.accuracy,
                source: source,
                timestamp: Date.now(),
                city: data.city,
                country: data.country,
                net:netType + "_" + source
            };
        }

        return data;
    }
}

