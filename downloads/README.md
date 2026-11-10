# Download counts

The `jpx-plus-downloads` Cloudflare Worker uses D1 to count successful saves and initiated file downloads for published configs. No GitHub login is required.

- Endpoint: `https://jpx-plus-downloads.lernsc.workers.dev/v1/downloads`
- `GET ?ids=5,6` returns `{"counts":{"5":0,"6":0}}` for published IDs. Unknown IDs are omitted.
- `POST {"configId":5,"day":"YYYY-MM-DD","visitor":"64 lowercase hex characters"}` returns the total and whether the event was newly counted.
- A private browser seed stays in userscript-manager storage. Only its SHA-256 derivative for this config and UTC date is sent. The server rejects stale dates.
- A unique `(day, config_id, visitor)` receipt and SQLite trigger increment the total atomically, including simultaneous requests. Saving and initiating a file download share the same daily receipt.
- Receipts older than three days are removed daily; cumulative totals remain. No GitHub identity, token, config contents, or raw IP address is stored in D1. Cloudflare processes connection IPs for edge rate limits. Worker request logging is disabled.
- The public catalog is cached for one minute per Worker instance. Recently withdrawn configs may remain countable during this window.
- File downloads count initiation, not completion on disk. Clearing script storage or switching browser profiles can bypass deduplication. IP limits reduce casual abuse but do not prove a download occurred. Network failures may undercount.

## Deployment

From this repository, after `npx wrangler@4.159.0 login`:

```powershell
npx wrangler@4.159.0 d1 execute jpx-plus-downloads --remote --file downloads/schema.sql --config downloads/wrangler.jsonc
npx wrangler@4.159.0 deploy --config downloads/wrangler.jsonc
```

The schema is idempotent and does not reset totals. The database ID in `wrangler.jsonc` belongs to this project; create your own D1 database when forking. Never commit OAuth credentials. `GET /health` checks routing; read a published ID to verify D1 and catalog access.

Offline verification: `node --test test/downloads.test.mjs` uses in-memory SQLite and mocked catalog responses.

## 中文说明

保存到“我的配置”成功或发起文件下载时计数；浏览、取消、失败不计。同一脚本存储中的浏览器对同一配置，每个 UTC 日最多计一次。网络异常不阻止保存或下载，未取得下载量时显示横线。历史下载量无法补录。

不接收 GitHub 身份、令牌或配置内容。数据库只保留配置编号、累计次数和短期匿名去重记录；Cloudflare 处理连接 IP 并限流。清除脚本存储或切换浏览器仍可能重复计数。
