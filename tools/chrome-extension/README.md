# Self-Media 抖音账号同步 Chrome 扩展

一键把浏览器中已登录的抖音账号同步到 Self-Media 后台，无需手动复制粘贴 Cookie。

## 安装

1. 打开 Chrome，访问 `chrome://extensions/`
2. 右上角打开 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择本目录（`tools/chrome-extension/`）

## 使用

1. 先在浏览器中登录 [抖音创作者中心](https://creator.douyin.com/)（手机扫码或账密登录）
2. 点击 Chrome 工具栏中的扩展图标
3. 首次使用：输入 Self-Media 管理密码，点「连接」
4. 扩展会自动检测已登录的抖音账号（读取 cookie 中的 `sessionid_ss` 和 `sec_uid`）
5. 点击 **「一键同步到 Self-Media」** 完成

## 配置

- **Self-Media 地址**：默认 `http://localhost:3000`，如果部署在其他地址可在 popup 底部修改
- 连接状态保存在扩展本地存储，关闭浏览器后需重新连接

## 注意事项

- 扩展只读取 `*.douyin.com` 域下的 cookie，不会发送到第三方
- 数据仅发往你自己配置的 Self-Media 地址（默认 localhost）
- Cookie 通常 7~30 天失效，失效后重新登录抖音再点同步即可
