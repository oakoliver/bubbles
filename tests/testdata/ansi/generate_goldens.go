//go:build ignore

// Regenerates xansi-goldens.json from real Go:
//
//	mkdir /tmp/ansigold && cp generate_goldens.go /tmp/ansigold/main.go && cd /tmp/ansigold
//	go mod init ansigold && go get charm.land/bubbles/v2@v2.2.1 github.com/charmbracelet/x/ansi@v0.11.8
//	go mod tidy && go run . > xansi-goldens.json
//
// Generates goldens for @oakoliver/bubbles' ANSI helpers and viewport from
// github.com/charmbracelet/x/ansi v0.11.8 and charm.land/bubbles/v2 v2.2.1.
package main

import (
	"encoding/json"
	"os"
	"strings"

	"charm.land/bubbles/v2/viewport"
	"github.com/charmbracelet/x/ansi"
)

type widthCase struct {
	Input string `json:"input"`
	Width int    `json:"width"`
	Strip string `json:"strip"`
}
type truncCase struct {
	Input  string `json:"input"`
	N      int    `json:"n"`
	Tail   string `json:"tail"`
	Expect string `json:"expect"`
}
type cutCase struct {
	Input  string `json:"input"`
	Left   int    `json:"left"`
	Right  int    `json:"right"`
	Expect string `json:"expect"`
}
type vpCase struct {
	Name     string   `json:"name"`
	Width    int      `json:"width"`
	Height   int      `json:"height"`
	XOffset  int      `json:"xOffset"`
	YOffset  int      `json:"yOffset"`
	SoftWrap bool     `json:"softWrap"`
	Lines    []string `json:"lines"`
	View     string   `json:"view"`
}
type out struct {
	Source       string      `json:"source"`
	Widths       []widthCase `json:"widths"`
	Truncate     []truncCase `json:"truncate"`
	TruncateLeft []truncCase `json:"truncateLeft"`
	Cut          []cutCase   `json:"cut"`
	Viewport     []vpCase    `json:"viewport"`
}

var inputs = []string{
	"see \x1b]8;id=1;https://example.com/docs\x1b\\the docs\x1b]8;;\x1b\\ now",
	"\x1b]8;;https://www.npmjs.com/package/@oakoliver/bubbles\x07available on npm\x1b]8;;\x07 today",
	"\x1b]0;My Title\x07Hello, World!",
	"\x1b]2;Window ☃ title\x1b\\\x1b[1;31mred\x1b[0m plain",
	"\x1b[38;5;212mpink \x1b]8;id=x;https://a.b/c?d=e;f\x1b\\linked\x1b]8;;\x1b\\ text\x1b[m end",
	"你好 \x1b]8;;https://example.cn\x1b\\世界\x1b]8;;\x1b\\!",
	"a\x1bP1$r0m\x1b\\b\x1b_Gf=1;xyz\x1b\\c\x1b^pm\x1b\\d\x1bXsos\x1b\\e",
	"\x1b7save\x1b8 \x1b(Bcharset\x1bc end",
	"\x1b[?25lhidden\x1b[?25h \x1b[2 qcursor \x1b[1;2Hmoved",
	"\x1b]8;;https://example.com/ünï\x1b\\ü link\x1b]8;;\x1b\\ after",
	"plain \x1b[4munder\x1b[24m text",
}

func main() {
	var o out
	o.Source = "github.com/charmbracelet/x/ansi v0.11.8, charm.land/bubbles/v2 v2.2.1 (go run in scratchpad ansigold)"
	for _, in := range inputs {
		sw := ansi.StringWidth(in)
		o.Widths = append(o.Widths, widthCase{in, sw, ansi.Strip(in)})
		for _, tail := range []string{"", "…"} {
			for n := 0; n <= sw+1; n++ {
				o.Truncate = append(o.Truncate, truncCase{in, n, tail, ansi.Truncate(in, n, tail)})
				o.TruncateLeft = append(o.TruncateLeft, truncCase{in, n, tail, ansi.TruncateLeft(in, n, tail)})
			}
		}
		for _, l := range []int{0, 1, 3, 5, 8} {
			for r := l; r <= sw+1; r++ {
				o.Cut = append(o.Cut, cutCase{in, l, r, ansi.Cut(in, l, r)})
			}
		}
	}

	link := func(url, text string) string { return "\x1b]8;;" + url + "\x1b\\" + text + "\x1b]8;;\x1b\\" }
	linkBel := func(url, text string) string { return "\x1b]8;id=pkg;" + url + "\x07" + text + "\x1b]8;;\x07" }
	lines := []string{
		"# Bubbles",
		"Install: " + linkBel("https://www.npmjs.com/package/@oakoliver/bubbles", "available on npm") + " now.",
		"Docs at " + link("https://github.com/oakoliver/bubbles#readme", "\x1b[1mthe README\x1b[22m") + ".",
		"\x1b]0;pager\x07Title set, " + link("https://example.com", "ex") + " and " + link("https://example.org", "org") + ".",
		"Plain line after the links.",
		"\x1b[32mgreen " + link("https://example.com/g", "linked green") + " tail\x1b[0m",
	}
	add := func(name string, w, h, x, y int, soft bool) {
		vp := viewport.New(viewport.WithWidth(w), viewport.WithHeight(h))
		vp.SoftWrap = soft
		vp.SetContent(strings.Join(lines, "\n"))
		vp.SetYOffset(y)
		vp.SetXOffset(x)
		o.Viewport = append(o.Viewport, vpCase{name, w, h, x, y, soft, lines, vp.View()})
	}
	add("fits", 60, 6, 0, 0, false)
	add("narrow", 20, 6, 0, 0, false)
	add("xoffset-4", 20, 6, 4, 0, false)
	add("xoffset-12", 20, 6, 12, 0, false)
	add("yoffset-1", 24, 3, 0, 1, false)
	add("softwrap", 20, 12, 0, 0, true)

	enc := json.NewEncoder(os.Stdout)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", " ")
	if err := enc.Encode(o); err != nil {
		panic(err)
	}
}
