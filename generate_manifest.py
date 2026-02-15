import os
import json

AUDIO_DIR = "Documents/GitHub/Kikiwake/sounds_Inaba"
MANIFEST_PATH = "Documents/GitHub/Kikiwake/manifest.json"

def generate_manifest():
    files = []
    if not os.path.exists(AUDIO_DIR):
        print(f"Error: {AUDIO_DIR} does not exist.")
        return

    # Try to load existing manifest to preserve manual edits (like labels)
    existing_labels = {}
    if os.path.exists(MANIFEST_PATH):
        try:
            with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
                old_data = json.load(f)
                for item in old_data:
                    if 'category_id' in item and 'label' in item:
                        existing_labels[item['category_id']] = item['label']
        except:
            pass

    for f in os.listdir(AUDIO_DIR):
        if f.endswith(".ogg"):
            # Parsing filename structure: I-XXXA.ogg or I-XXXB.ogg
            try:
                name_part = os.path.splitext(f)[0] # I-000A
                parts = name_part.split('-')
                if len(parts) == 2:
                    id_variant = parts[1] # 000A
                    cat_id_str = id_variant[:-1] # 000
                    variant = id_variant[-1] # A
                    
                    cat_id = int(cat_id_str)
                    
                    # Skip 0 if not needed, or include. Prompt says 1..100.
                    # If cat_id is 0, maybe practice?
                    
                    label = existing_labels.get(cat_id, str(cat_id))

                    files.append({
                        "filename": f,
                        "path": f"sounds_Inaba/{f}",
                        "category_id": cat_id,
                        "variant": variant,
                        "label": label
                    })
            except Exception as e:
                print(f"Skipping {f}: {e}")

    # Sort by category
    files.sort(key=lambda x: (x['category_id'], x['variant']))

    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(files, f, indent=2, ensure_ascii=False)
    
    print(f"Generated manifest with {len(files)} entries at {MANIFEST_PATH}")

if __name__ == "__main__":
    generate_manifest()