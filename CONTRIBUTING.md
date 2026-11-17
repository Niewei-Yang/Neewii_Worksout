# 贡献说明

欢迎修正文档、报告问题或改进运动展示与同步流程。

## 提交前

- 先阅读 [README](README.md) 与[文档索引](docs/README.md)，确认改动涉及经典版、新版，还是共用数据层。
- 复用上游代码或设计时注明来源，保留相应版权与许可声明。
- 说明用户可观察到的变化；涉及统计时说明运动类型、单位、时间与缺失数据的处理口径。
- 不将本地 `.env`、编译缓存、临时报告或生成的分享图片纳入提交。

## 验证

纯文档改动检查路径、链接与命令即可。

需要格式化代码时，前端运行 `pnpm format`，Python 安装下方开发依赖后运行 `python -m black . --target-version py312`。

前端改动：

```bash
pnpm test:dashboard
pnpm typecheck
pnpm build
```

修改数据重置脚本时运行 `pnpm test:data-clean`。该测试使用临时目录验证备份、空数据初始化和路径保护，不会清理当前项目的数据。

Python 改动先安装开发依赖，再执行相关测试：

```bash
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests
```

涉及统计、导入或字段变化时，应验证对应数据口径。使用测试数据验证逻辑；运行同步脚本并不属于普通代码验证步骤。
