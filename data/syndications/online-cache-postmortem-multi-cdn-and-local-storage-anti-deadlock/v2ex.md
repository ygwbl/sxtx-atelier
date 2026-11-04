[分享] 线上缓存踩坑实录：多层 CDN 与前端本地存储的防死锁方案

前两天工坊遭遇了非常典型且棘手的缓存死锁问题：源站代码与文章早已更新，接口也是通的，但国内外的边缘节点与客户端却持续返回昨天的旧页面。本文将这次排查中遇到的 CDN 静态哈希碰撞、stale-if-error 容灾反向锁死以及 Service Worker 离线拦截问题作一次完整复盘，并给出彻底根治的动静双轨分离与自愈方案。

完整实战复盘与代码沉淀：
https://hlat.top/article/online-cache-postmortem-multi-cdn-and-local-storage-anti-deadlock

欢迎各位 V 友交流拍砖~