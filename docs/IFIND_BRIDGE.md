# iFinD连接与临时桥接

实际验证：本机直接调用官方HTTPS 8643接口成功。线上Worker在initialize阶段超时，显式allow_custom_ports后仍失败，因此不能把端口配置称为已确认根因。iFinD账号有剩余额度。

截止前临时方案：线上Worker通过HTTPS向鉴权桥接请求；桥接仅监听127.0.0.1，使用官方Cloudflare Tunnel，向iFinD官方接口调用固定get_stock_events工具。仅允许1–3个标准A股代码；不接收任意URL、工具或提示词。桥接持有本机iFinD密钥，云端只保存独立随机桥接密钥，所有Secret及原始受限数据均不进入Git。

运行：本机配置忽略的.dev.vars中的IFIND_MCP_TOKEN，执行`node --experimental-strip-types scripts/ifind-relay.mjs`；另一个终端执行`cloudflared tunnel --url http://127.0.0.1:8789 --protocol http2 --no-autoupdate`。随机桥接密钥保存到忽略的.sites-runtime/ifind-relay-token（0600），不可贴进聊天或提交。将HTTPS地址加上/ifind作为Site的IFIND_RELAY_URL，将密钥设为Secret IFIND_RELAY_TOKEN；验证云端实际诊断成功后启用IFIND_MCP_ENABLED=true。

限制：这是依赖本机与临时隧道的桥接，电脑休眠、离线、进程停止都会失效，地址重启可能变化，服务没有稳定性保证。不可作为常驻生产部署承诺。后续应在有固定HTTPS地址的常驻Node后端部署同一只读服务。

安全边界：强随机Bearer鉴权，固定官方目的地址与工具，参数验证，单请求并发，30次/小时上限，2KB请求上限，180KB供应商响应上限，HTTPS隧道，拒绝跳转，不返回供应商异常原文；不接收浏览器跨域调用。永久部署前还需完善访问监控和限流。停止：对两个终端Ctrl-C，移除云端IFIND_RELAY_TOKEN/IFIND_RELAY_URL并停用IFIND_MCP_ENABLED。

验证脚本`node scripts/check-ifind-relay.mjs HTTPS_ORIGIN`检查401鉴权拒绝、400无效参数拒绝及code=1的真实返回，仅打印状态，不打印密钥或原始金融数据。诊断会消耗iFinD次数，不调用OpenAI。

线上工作台诊断已实际返回“连接与查询成功 · iFinD MCP · get_stock_events · 本机鉴权桥接”；证据缺失仍标为需核验。随后开启IFIND_MCP_ENABLED。诊断没有消耗OpenAI请求；模型累计仍15/25。临时HTTPS桥接401鉴权拒绝、400参数拒绝和HTTP200/code=1真实响应均通过。依赖本机服务和隧道保持运行，不承诺常驻稳定性。
