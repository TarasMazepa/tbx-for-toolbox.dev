/**
 * Test data for classifying terminal screen text in tbx-terminal-deck.js.
 *
 * Each entry represents a captured terminal screen sample:
 * - name: Short descriptive identifier
 * - userChoice: true if the terminal is waiting on a user choice/action prompt,
 *               false if it is NOT a user choice (e.g. autocomplete popup, running, idle)
 * - windowName: Simulated Terminal.app window title (defaults to 'agy')
 * - cols: Optional terminal column width
 * - text: Verbatim terminal text sample
 * - notes: Context on why this sample is classified as userChoice true/false
 */

const SAMPLES = [
  {
    name: 'at-mention-autocomplete-with-enter-select',
    userChoice: false,
    windowName: 'agy',
    cols: 113,
    notes: 'Autocomplete popup for @ mention has "↑/↓ Navigate · enter Select · tab Complete" — typing/completing input, not an agent user-choice prompt.',
    text: `> we need a negatice filter for @[tbx-remote-terminal.js] sometimes we have "navigate" but with "enter Select" 
  option @
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
> conversation:                                       Conversation  Reference a past conversation
  docs/                                               Directory     /Users/tm/tbx-for-toolbox.dev/docs
  till/                                               Directory     /Users/tm/tbx-for-toolbox.dev/till
  .github/                                            Directory     /Users/tm/tbx-for-toolbox.dev/.github
  scripts/                                            Directory     /Users/tm/tbx-for-toolbox.dev/scripts
   ↓ 46 more


  ↑/↓ Navigate · enter Select · tab Complete`,
  },
  {
    name: 'command-permission-prompt',
    userChoice: true,
    windowName: 'agy',
    notes: 'Agent permission prompt asking user to approve or cancel running a command.',
    text: `Requesting permission for:
   stax commit -Abdn "Add test data and harness for tbx-remote-terminal.js" --accept-all

Run this command?
> 1. Yes, run command
  2. Yes, and always allow in this conversation for commands that start with 'stax'
  3. Yes, and always allow for commands that start with 'stax' (Persist to settings.json)
  4. No, cancel

  ↑/↓ Navigate · tab Amend · ctrl+g edit/expand command
esc to cancel                                                                   auto · Gemini 4 Hydrogen · medium`,
  },
  {
    name: 'ask-question-single-select',
    userChoice: true,
    windowName: 'agy',
    notes: 'Interactive single-select ask_question prompt. Contains "enter Select" like autocomplete, but with "→ Next" and "esc Skip" instead of "tab Complete".',
    text: `> can you help me to find more samples? ask me different kinds of questions

▸ Thought for 3s, 210 tokens
  Initial hypothesis: leveraging the available tool to prompt the user for more information, aiming to gather...

? Single-select sample: How would you like to proceed with the classifier?
? Multi-select sample: Which other terminal UI states should we capture?

Question
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Question 1/2: Single-select sample: How would you like to proceed with the classifier?

> 1. (Recommended) Keep gathering samples first
  2. Update detectAgyState after 3-5 samples
  3. Update detectAgyState right away
  4. Write-in...

  ↑/↓ Navigate · → Next · enter Select · esc Skip
esc to cancel                                                                   auto · Gemini 4 Hydrogen · medium`,
  },
  {
    name: 'ask-question-multi-select',
    userChoice: true,
    windowName: 'agy',
    notes: 'Interactive multi-select ask_question prompt with checkboxes and "space Toggle · enter Submit All · esc Skip".',
    text: `> can you help me to find more samples? ask me different kinds of questions

▸ Thought for 3s, 210 tokens
  Initial hypothesis: leveraging the available tool to prompt the user for more information, aiming to gather...

? Single-select sample: How would you like to proceed with the classifier?
? Multi-select sample: Which other terminal UI states should we capture?

Question
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Question 2/2: Multi-select sample: Which other terminal UI states should we capture?

> 1. [ ] Single-select ask_question
  2. [ ] Multi-select ask_question
  3. [ ] Slash-command autocomplete (/)
  4. [ ] File edit permission prompt
  5. [ ] Idle prompt / Thinking spinner
  6. Write-in...

  ↑/↓ Navigate · ← Back · space Toggle · enter Submit All · esc Skip
esc to cancel                                                                   auto · Gemini 4 Hydrogen · medium`,
  },
  {
    name: 'slash-command-autocomplete-while-running',
    userChoice: false,
    windowName: 'agy',
    notes: 'Slash-command autocomplete popup (/) shown while a command is running; ends with "↑/↓ Navigate · enter Select · tab Complete" and "esc to cancel".',
    text: `> let's add those two samples to the PR

● Ran (stax amend -A --accept-all)
● Running (stax amend -A --accept-all) (ctrl+o to expand)
⣯  Running command...
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
> /
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
> /add-dir             Add a directory to the workspace
  /agents              List available custom agents
  /artifact            View and review artifacts
  /btw                 Ask a side question without interrupting the current task
  /changelog           Show release notes and changes
   ↓ 45 more

  ↑/↓ Navigate · enter Select · tab Complete
esc to cancel                                                                   auto · Gemini 4 Hydrogen · medium`,
  },
  {
    name: 'file-edit-permission-prompt',
    userChoice: true,
    windowName: 'agy',
    notes: 'File edit permission prompt asking "Accept this file edit?" with "↑/↓ Navigate · f full diff".',
    text: `  shift+tab to auto-approve file edits
Accept this file edit?
> 1. Yes, accept this change
  2. No, reject this change

  ↑/↓ Navigate · f full diff
esc to cancel                                                                          Gemini 4 Hydrogen · medium`,
  },
];

module.exports = {
  SAMPLES,
};
