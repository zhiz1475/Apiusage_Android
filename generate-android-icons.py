from pathlib import Path
from PIL import Image, ImageDraw

source = Image.open(Path('mobile/assets/kapibala-logo.png')).convert('RGBA')
root = Path('android/app/src/main/res')
sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}

for density, size in sizes.items():
    folder = root / f'mipmap-{density}'
    folder.mkdir(parents=True, exist_ok=True)
    canvas = Image.new('RGBA', (size, size), (118, 37, 44, 255))
    inner = source.copy()
    inner.thumbnail((round(size * .78), round(size * .78)), Image.Resampling.LANCZOS)
    canvas.alpha_composite(inner, ((size - inner.width) // 2, (size - inner.height) // 2))
    canvas.save(folder / 'ic_launcher.png')
    canvas.save(folder / 'ic_launcher_round.png')
    foreground = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    foreground.alpha_composite(inner, ((size - inner.width) // 2, (size - inner.height) // 2))
    foreground.save(folder / 'ic_launcher_foreground.png')

# Capacitor's template splash is blue. Keep the launch surface in the same
# grayscale/dark-red language as the mobile UI and use the retained capybara
# mark as the only artwork.
for splash_path in root.glob('drawable*/splash.png'):
    width, height = Image.open(splash_path).size
    canvas = Image.new('RGBA', (width, height), (29, 29, 31, 255))
    mark = source.copy()
    mark.thumbnail((round(min(width, height) * .28), round(min(width, height) * .28)), Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark, ((width - mark.width) // 2, (height - mark.height) // 2))
    canvas.save(splash_path)
