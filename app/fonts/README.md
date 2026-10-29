# Bundled fonts

The root layout uses `next/font/local` so development and production builds never
download fonts. This avoids the Google Fonts response parsing failure tracked in
[Next.js #99114](https://github.com/vercel/next.js/issues/99114), which broke the
Vercel build of `b43e551` on October 29, 2026.

Both fonts come from the official [Google Fonts repository](https://github.com/google/fonts/tree/6157dfaa640ca5738b4d1a7070fe389c3036d7fc/ofl)
at commit `6157dfaa640ca5738b4d1a7070fe389c3036d7fc`:

| Bundled file | Original file | License |
| --- | --- | --- |
| `Inter-Variable.woff2` | `ofl/inter/Inter[opsz,wght].ttf` | [SIL OFL 1.1](./Inter-OFL.txt) |
| `Outfit-Variable.woff2` | `ofl/outfit/Outfit[wght].ttf` | [SIL OFL 1.1](./Outfit-OFL.txt) |

The files retain the full character sets and variable weight axes. Inter's
optical size is fixed at 14, matching the previous Google Fonts request, which
requested only the weight axis. Outfit's CSS weight range remains 500–800.

To regenerate, download those two TTF files and their adjacent `OFL.txt` files
from that pinned commit. With Python and `fonttools[woff]==4.60.1` installed,
run the following in the directory containing `Inter.ttf` and `Outfit.ttf`, then
copy the resulting WOFF2 files here. This tooling is only needed to update fonts;
cloning, building, and deploying the app require no font conversion tools.

```python
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

for family in ["Inter", "Outfit"]:
    font = TTFont(f"{family}.ttf")
    if family == "Inter":
        font = instantiateVariableFont(font, {"opsz": 14}, inplace=True)
    font.flavor = "woff2"
    font.save(f"{family}-Variable.woff2")
```
