# Render from the repo root: vhs assets/tapes/ide.tape
Output assets/ide.gif

Set Shell bash
Set FontSize 15
Set Width 1100
Set Height 560
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 60ms

Hide
Type "export PS1='> ' && clear"
Enter
Show

Type "bun examples/ide.ts"
Sleep 300ms
Enter
Sleep 1.5s
Down
Sleep 400ms
Right
Sleep 400ms
Down
Sleep 400ms
Right
Sleep 500ms
Down 2
Sleep 500ms
Enter
Sleep 900ms
Tab
Sleep 400ms
Down 3
Sleep 300ms
Ctrl+g
Sleep 1.2s
Tab
Sleep 400ms
Type "q"
Sleep 500ms
