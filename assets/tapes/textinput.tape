# Render from the repo root: vhs assets/tapes/textinput.tape
Output assets/textinput.gif

Set Shell bash
Set FontSize 16
Set Width 760
Set Height 300
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 60ms

Hide
Type "export PS1='> ' && clear"
Enter
Show

Type "bun examples/textinput.ts"
Sleep 300ms
Enter
Sleep 1.2s
Type "charmbracelet/bu"
Sleep 900ms
Down
Sleep 900ms
Tab
Sleep 900ms
Enter
Sleep 600ms
Type "hunter2-secret"
Sleep 1.5s
