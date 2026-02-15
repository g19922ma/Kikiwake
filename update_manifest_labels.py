import json
import re

SOURCE_FILE = "Documents/GitHub/Kikiwake/kimariji_source.txt"
MANIFEST_FILE = "Documents/GitHub/Kikiwake/manifest.json"

def parse_and_update():
    labels = {} 
    
    with open(SOURCE_FILE, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    current_var = None
    current_id = None
    
    for line in lines:
        line = line.strip()
        
        # Match 1: GameObject var = Find("KimarijiX");
        # Regex: GameObject\s+(\w+)\s*=\s*GameObject\.Find\("Kimariji(\d+)"\);
        m1 = re.search(r'GameObject\s+(\w+)\s*=\s*GameObject\.Find\("Kimariji(\d+)"\);', line)
        if m1:
            current_var = m1.group(1)
            current_id = int(m1.group(2))
            continue
        
        # Match 2: var.GetComponent...text = "TEXT";
        # Regex: var\.GetComponent<TextMeshPro>\(\)\.text\s*=\s*"([^"]+)";
        if current_var and line.startswith(f'{current_var}.GetComponent<TextMeshPro>().text'):
            m2 = re.search(r'text\s*=\s*"([^"]+)"', line)
            if m2:
                labels[current_id] = m2.group(1)
                # print(f"Mapped {current_id} -> {labels[current_id]}")
                current_var = None 
                current_id = None

    print(f"Parsed {len(labels)} labels from source.")

    # Update Manifest
    try:
        with open(MANIFEST_FILE, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
            
        updated_count = 0
        for item in manifest:
            cat_id = item.get('category_id')
            if cat_id in labels:
                item['label'] = labels[cat_id]
                updated_count += 1
        
        # Also, check if any labels were NOT updated (missing from source)
        # for item in manifest:
        #     if 'label' not in item:
        #         print(f"Warning: No label for category {item['category_id']}")

        with open(MANIFEST_FILE, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
            
        print(f"Updated {updated_count} entries in manifest.json")
        
    except Exception as e:
        print(f"Error updating manifest: {e}")

if __name__ == "__main__":
    parse_and_update()