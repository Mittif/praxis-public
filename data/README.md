# 本地题库

运行时题库、导入报告、原页图片和历史版本均属于本地数据，不随公开仓库或 GitHub 上传包分发。请只使用自己有权使用的内容。

首次克隆时可生成自编演示题库：

```sh
python3 scripts/init_demo_bank.py
```

脚本生成 200 道简单算术演示题，覆盖四个题集与单选、多选，便于体验 20 / 30 / 50 题练习。它们用于展示软件行为，不是考试真题或备考资料。脚本不会覆盖已有的 `data/questions.json`。

使用自己的题库时，将 JSON 放在 `data/questions.json`，材料图片放在 `data/assets/`，然后运行：

```sh
python3 scripts/bank.py validate data/questions.json
```

这些运行文件默认被 Git 忽略。原始 PDF 保存在仓库根目录的 `题库/`，同样只在本地保留。源码、公开文档和自编展示截图仍在版本控制中。

## 题目格式

题库文件是 JSON 数组，以下为自编示例：

```json
[
  {
    "id": "example-001",
    "revision": 1,
    "status": "candidate",
    "bank": "真题速攻-经济基础",
    "stem": "【自编示例】1 + 1 的结果是？",
    "multiple": false,
    "options": [
      {"id": "A", "text": "2"},
      {"id": "B", "text": "3"},
      {"id": "C", "text": "4"},
      {"id": "D", "text": "5"}
    ],
    "answer": ["A"],
    "explanation": "1 + 1 = 2，选项A正确。",
    "source": "自编示例",
    "number": "1",
    "images": []
  }
]
```

题目 ID 必须唯一，选项 ID 在题内唯一，答案引用固定选项 ID。当前界面支持 A–E 的 2–5 个选项，单选题只提供一个正确选项。保持题目身份不变时增加 `revision`，不要为排版修改重新分配 ID。案例可使用 `material` 和 `/assets-bank/` 下的图片；材料与题目 API 一样要求登录。

`bank` 使用 [后端分类配置](../backend/app.py) 中的题集。配置任意新分类时还需同步修改前端筛选；原始标签与显示标签的区别见 [解析引用规则](../docs/explanation-references.md)。

## 修正 PDF 硬换行

```sh
.venv/bin/python scripts/normalize_bank.py          # 只扫描，不修改
.venv/bin/python scripts/normalize_bank.py --apply  # 私有备份后修正
```

工具扫描全部题干、选项、解析和材料，连接正文中的排版换行，保留完整句子、列表、表格和公式的逻辑换行；英文单词之间保留空格。仅改变空白字符，有变化题目的 `revision` 增加 1，题目 ID、答案、选项 ID、来源和图片保持原样。重复运行不会重复修订。后续 PDF 导入也使用同一规则。

原题库备份和包含修改 ID、疑似公式碎片／来源标题等项目的报告保存在私有的 `data/text-cleanup/`。这些提取异常需要核对原页，工具不会猜测或改写公式、数字或答案。历史答题会话继续保留原快照，接口在展示时使用相同的换行规则，读题无需清空记录或重做；运行中的服务需要重新加载代码与题库后生效。
