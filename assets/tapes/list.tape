# Render from the repo root: vhs assets/tapes/list.tape
Output assets/list.gif

Set Shell bash
Set FontSize 16
Set Width 800
Set Height 640
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 60ms

Hide
Type "export PS1='> ' && clear"
Enter
Show

Type "bun examples/list.ts"
Sleep 300ms
Enter
Sleep 1.5s
Down
Sleep 300ms
Down
Sleep 300ms
Down
Sleep 300ms
Down
Sleep 600ms
Type "/"
Sleep 500ms
Type "te"
Sleep 900ms
Enter
Sleep 600ms
Down
Sleep 500ms
Down
Sleep 1.5s
Escape
Sleep 1s
Ctrl+c
Sleep 600ms
