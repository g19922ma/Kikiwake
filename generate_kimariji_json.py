import re
import json

# 入力ファイルと出力ファイル
source_file = 'kimariji_source.txt'
output_file = 'kimariji.json'

# kimariji_source.txt を読み込む
try:
    with open(source_file, 'r', encoding='utf-8') as f:
        text_content = f.read()
except FileNotFoundError:
    print(f"Error: {source_file} not found.")
    exit(1)

# 正規表現でIDと決まり字を抽出
regex = r'GameObject.Find\("Kimariji(\d+)"\);\s*\w+\.GetComponent<TextMeshPro>\(\)\.text = "([^"]+)";'
matches = re.findall(regex, text_content)

# 抽出したデータをリストに格納
kimariji_data = []
for match in matches:
    kimariji_data.append({
        "id": int(match[0]),
        "kimariji": match[1]
    })

# JSONファイルとして書き出す
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(kimariji_data, f, ensure_ascii=False, indent=2)

print(f"Successfully generated {output_file} with {len(kimariji_data)} entries.")
