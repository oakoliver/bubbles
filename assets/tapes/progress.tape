# Render from the repo root: vhs assets/tapes/progress.tape
Output assets/progress.gif

Set Shell bash
Set FontSize 16
Set Width 760
Set Height 180
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 60ms

Hide
Type "export PS1='> ' && clear"
Enter
Show

Type "bun examples/progress.ts"
Sleep 300ms
Enter
Sleep 6.5s
