#!/usr/bin/env bash
#
# Updates icons font `client/src/viwer-icons.*` and corresponding .js and .css
# assets based on the content of icons/src/*.svgz files. Is NOT a part of
# standard building process, a dev tool.
#
# Requires inkscape and fontforge with Python bindings.

set -euo pipefail
shopt -s nullglob

input_dir="${1:-icons/src}"
output_dir="${2:-icons/build}"

mkdir -p "$output_dir"

normalize_svg() {
    local src="$1"
    local basename stem dst

    basename="${src##*/}"
    stem="${basename%.svgz}"
    stem="${stem%.svg}"
    dst="$output_dir/${stem}.svg"

    echo "Normalizing: $src"

    inkscape "$src" \
        --export-filename="$dst" \
        --export-plain-svg \
        --export-type=svg \
        --actions="select-all;selection-ungroup;select-all;selection-ungroup;select-all;object-stroke-to-path;path-union;export-do"

    printf 'Written: %s\n' "$dst"
}

for src in "$input_dir"/*.svg "$input_dir"/*.svgz; do
    [[ "$src" == *.svg ]] && continue
    normalize_svg "$src"
done

fontforge -lang=py -script /dev/stdin "$output_dir" <<'PY'
import fontforge, glob, os, sys, json

output_dir = sys.argv[1]

font = fontforge.font()
font.fontname = "ViewerIcons"
font.familyname = "Viewer Icons"
font.fullname = "Viewer Icons"
font.em = 1000

codepoint = 0xE001
codepoints = {}
for filename in sorted(
    glob.glob(os.path.join(output_dir, "*.svg"))
):
    name = os.path.basename(filename).removesuffix(".svg")

    glyph = font.createChar(codepoint, name)
    glyph.importOutlines(filename)
    glyph.width = 1000
    
    codepoints[name] = codepoint

    codepoint += 1

font.generate(os.path.join("./client/src", "viewer-icons.ttf"))
font.generate(os.path.join("./client/src", "viewer-icons.woff2"))

font.close()


font_basename = "viewer-icons"
font_family = "ViewerIcons"
css_prefix = "vi"

json_path = os.path.join("client/src/", f"{font_basename}.json")
css_path = os.path.join("client/src/", f"{font_basename}.css")

# Symbolic name -> numeric Unicode code point.
with open(json_path, "w", encoding="utf-8") as stream:
    json.dump(
        codepoints,
        stream,
        indent=2,
        sort_keys=True
    )
    stream.write("\n")

with open(css_path, "w", encoding="utf-8") as stream:
    stream.write(f"""\
@font-face {{
  font-family: "{font_family}";
  src: url("./{font_basename}.woff2") format("woff2");
  font-weight: normal;
  font-style: normal;
  font-display: block;
}}

.{css_prefix} {{
  display: inline-block;
  font-family: "{font_family}";
  font-style: normal;
  font-weight: normal;
  font-variant: normal;
  line-height: 1;
  text-rendering: auto;
  text-transform: none;
  user-select: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}}

""")

    for name, codepoint in sorted(codepoints.items()):
        stream.write(
            f".{css_prefix}-{name}::before {{ "
            f'content: "\\{codepoint:04x}"; '
            f"}}\n"
        )

PY
