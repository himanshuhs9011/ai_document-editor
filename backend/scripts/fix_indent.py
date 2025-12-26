with open('main.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix lines 499-502 (0-indexed: 498-501)
for i in [499, 500, 501, 502]:
    if lines[i].startswith('    print'):
        lines[i] = '    ' + lines[i]  # Add 4 more spaces

with open('main.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("✅ Fixed indentation")
