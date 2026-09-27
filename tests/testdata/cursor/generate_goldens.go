//go:build ignore

// Regenerates cursor-colour-goldens.json from real Go (charm.land/bubbles/v2 v2.2.1):
//
//	go run generate_goldens.go > cursor-colour-goldens.json
//
// (run inside a module that requires charm.land/bubbles/v2 v2.2.1 and
// charm.land/lipgloss/v2).
//
// Renders textinput and textarea with the virtual cursor after SetStyles with
// a nil cursor colour and with an explicit one.
package main

import (
	"encoding/json"
	"image/color"
	"os"

	"charm.land/bubbles/v2/textarea"
	"charm.land/bubbles/v2/textinput"
	"charm.land/lipgloss/v2"
)

type gcase struct {
	Name      string `json:"name"`
	Component string `json:"component"`
	Color     *string `json:"color"` // nil => no colour
	Blink     bool   `json:"blink"`
	Value     string `json:"value"`
	View      string `json:"view"`
}

func sp(s string) *string { return &s }

func col(s *string) color.Color {
	if s == nil {
		return nil
	}
	return lipgloss.Color(*s)
}

func main() {
	var out []gcase
	colors := []*string{nil, sp("#ff00ff"), sp("2"), sp("212")}
	for _, c := range colors {
		for _, blink := range []bool{true, false} {
			for _, val := range []string{"", "hi"} {
				// textinput
				ti := textinput.New()
				ti.Placeholder = ""
				if val == "" {
					ti.Placeholder = "type"
				}
				// Width is set because with Width 0 upstream renders only the
				// first placeholder rune (a separate quirk, not under test here).
				ti.SetWidth(20)
				s := textinput.DefaultDarkStyles()
				s.Cursor.Color = col(c)
				s.Cursor.Blink = blink
				ti.SetStyles(s)
				ti.Focus()
				ti.SetValue(val)
				name := "nil"
				if c != nil {
					name = *c
				}
				out = append(out, gcase{Name: "textinput/" + name, Component: "textinput", Color: c, Blink: blink, Value: val, View: ti.View()})

				ta := textarea.New()
				ta.Placeholder = ""
				if val == "" {
					ta.Placeholder = "type"
				}
				ta.SetWidth(20)
				ta.SetHeight(2)
				ts := textarea.DefaultDarkStyles()
				ts.Cursor.Color = col(c)
				ts.Cursor.Blink = blink
				ta.SetStyles(ts)
				ta.Focus()
				ta.SetValue(val)
				out = append(out, gcase{Name: "textarea/" + name, Component: "textarea", Color: c, Blink: blink, Value: val, View: ta.View()})
			}
		}
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	enc.Encode(out)
}
