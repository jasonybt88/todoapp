Hi everyone, start implementation now using the tutorial you reviewed:
https://github.com/kenken64/AI-SDLC-Workshop-Day1n2/blob/main/PRPs/*.md

The local working directory will be:
~workingDirectory\Day 2\ToDoApp\todoapp

The GitHub repository will be:
https://github.com/jasonybt88/todoapp.git

Create the working folder and associate the GitHub repository yourselves.
For a new workspace, initialize Git with backend as the first branch, following
Step 1 of the tutorial, and configure the remote with:
git remote add origin https://github.com/jasonybt88/todoapp.git


If the working folder or Git repository already exists, inspect its state and
origin before continuing. Reuse the correct setup and preserve existing work.

Use D:/Projects/snip-demo-workshop-day1 wherever the tutorial refers to its
snip-demo project folder. Do not create a nested snip-demo folder. Replace every
<REPO_URL> placeholder with https://github.com/jasonybt88/todoapp.git


Responsibilities:
- implement backend and establish the shared API
  contract used by both clients.
- implement frontend against that contract.
- implement cli against that contract.
- coordinate the shared workspace and implement:
  the main superproject, submodules, generated bundle, build script, GitHub Actions,
  and Docker release pipeline.

Commit, push, and verify each component.
Keep component files at their branch roots; let Git create the submodule folders
rather than creating those folders in advance.

Run the verification checks for every
step. Report completed work, branches and commits, test results, and any blockers.
