# FlightADSB 航迹下载与 GPX 转换

本文记录如何从 FlightADSB/VariFlight 的回放链接下载航迹，并转换为 JSON、CSV、GPX。

示例链接：

```text
https://flightadsb.variflight.com/playback/bed9a74ed0862eb829f358ebcf2adeac/1780877700
```

## 1. 从链接提取参数

回放链接格式通常是：

```text
https://flightadsb.variflight.com/playback/{dynamicId}/{scheduledDeptime}
```

示例中：

```text
dynamicId = bed9a74ed0862eb829f358ebcf2adeac
scheduledDeptime = 1780877700
```

## 2. 请求航迹接口

实际航迹接口是：

```text
https://adsbapi.variflight.com/api/v2/business/dynamic/flightPath
```

请求示例：

```powershell
curl.exe -L "https://adsbapi.variflight.com/api/v2/business/dynamic/flightPath?dynamicId=bed9a74ed0862eb829f358ebcf2adeac&scheduledDeptime=1780877700" `
  -H "Origin: https://flightadsb.variflight.com" `
  -H "Referer: https://flightadsb.variflight.com/" `
  -o flightpath-response.json
```

返回 JSON 结构大致是：

```json
{
  "code": 200,
  "msg": "success!",
  "data": "..."
}
```

其中 `data` 是加密后的航迹内容。

## 3. 解密 data

网页前端使用的解密方式是：

```text
AES-128-ECB
key = flightadsb123456
padding = PKCS#7
```

下面的 Node.js 脚本会完成：

- 读取接口返回的 `flightpath-response.json`
- 解密 `data`
- 写出解密后的 JSON
- 写出主航迹 CSV
- 写出 GPX

保存为 `flightadsb-export.js`：

```js
const fs = require("fs");
const crypto = require("crypto");

const dynamicId = "bed9a74ed0862eb829f358ebcf2adeac";
const scheduledDeptime = "1780877700";
const baseName = `flightadsb_${dynamicId}_${scheduledDeptime}`;

const resp = JSON.parse(fs.readFileSync("flightpath-response.json", "utf8"));

if (resp.code !== 200 || !resp.data) {
  throw new Error(`Bad response: ${JSON.stringify(resp).slice(0, 500)}`);
}

const key = Buffer.from("flightadsb123456", "utf8");
const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
decipher.setAutoPadding(true);

const plain =
  decipher.update(resp.data, "base64", "utf8") + decipher.final("utf8");

const obj = JSON.parse(plain);
fs.writeFileSync(`${baseName}.json`, JSON.stringify(obj, null, 2), "utf8");

const rows = obj.trace?.path || [];

function csvEscape(value) {
  if (value === undefined || value === null) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
}

const csvColumns = Array.from(
  rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set())
);

fs.writeFileSync(
  `${baseName}.csv`,
  [
    csvColumns.join(","),
    ...rows.map((row) => csvColumns.map((col) => csvEscape(row[col])).join(",")),
  ].join("\n"),
  "utf8"
);

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isoTime(seconds) {
  const value = Number(seconds);
  return Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

const gpxPoints = rows.filter(
  (point) =>
    Number.isFinite(Number(point.Lat)) && Number.isFinite(Number(point.Lon))
);

const first = gpxPoints[0] || {};
const trackName = first.Fnum
  ? `${first.Fnum}${first.Anum ? ` ${first.Anum}` : ""}`
  : "FlightADSB track";

const gpx = [];
gpx.push('<?xml version="1.0" encoding="UTF-8"?>');
gpx.push(
  '<gpx version="1.1" creator="FlightADSB converter" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">'
);
gpx.push(`  <metadata><name>${xmlEscape(trackName)}</name></metadata>`);
gpx.push("  <trk>");
gpx.push(`    <name>${xmlEscape(trackName)}</name>`);
gpx.push("    <trkseg>");

for (const point of gpxPoints) {
  gpx.push(
    `      <trkpt lat="${Number(point.Lat)}" lon="${Number(point.Lon)}">`
  );

  if (Number.isFinite(Number(point.Alt))) {
    gpx.push(`        <ele>${Number(point.Alt)}</ele>`);
  }

  const time = isoTime(point.Time);
  if (time) {
    gpx.push(`        <time>${time}</time>`);
  }

  const desc = Object.entries(point)
    .filter(([key, value]) => {
      return !["Lat", "Lon", "Alt", "Time"].includes(key) && value !== "";
    })
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");

  if (desc) {
    gpx.push(`        <desc>${xmlEscape(desc)}</desc>`);
  }

  gpx.push("      </trkpt>");
}

gpx.push("    </trkseg>");
gpx.push("  </trk>");
gpx.push("</gpx>");

fs.writeFileSync(`${baseName}.gpx`, `${gpx.join("\n")}\n`, "utf8");

console.log({
  json: `${baseName}.json`,
  csv: `${baseName}.csv`,
  gpx: `${baseName}.gpx`,
  points: gpxPoints.length,
  firstTime: isoTime(gpxPoints[0]?.Time),
  lastTime: isoTime(gpxPoints.at(-1)?.Time),
});
```

运行：

```powershell
node flightadsb-export.js
```

## 4. 输出字段说明

解密后的主航迹在：

```text
trace.path
```

常见字段：

| 字段 | 含义 |
| --- | --- |
| `Lat` | 纬度 |
| `Lon` | 经度 |
| `Alt` | 高度 |
| `Spd` | 速度 |
| `Vspd` | 垂直速度 |
| `Ang` | 航向角 |
| `Time` | Unix 时间戳，秒 |
| `Fnum` | 航班号 |
| `Anum` | 机号 |
| `Squawk` | 应答机编码 |
| `onground` | 地面状态 |

GPX 中使用：

- `trkpt lat/lon`: `Lat` / `Lon`
- `ele`: `Alt`
- `time`: `Time` 转 UTC ISO 时间
- `desc`: 其他字段

## 5. 注意事项

- 该接口和加密方式来自网页前端行为，网站后续更新后可能会变化。
- `scheduledDeptime` 是秒级 Unix 时间戳，不是毫秒。
- GPX 时间一般使用 UTC；例如北京时间需要在查看软件里按时区显示。
- 请遵守 FlightADSB/VariFlight 的使用条款，不要高频批量请求。
