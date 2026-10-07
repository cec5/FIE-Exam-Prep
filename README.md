# FIE Referee Exam Practice

I created this to assist myself in studying for the theoretical portion of the exam.

## Layout

- `_config.yml` – site settings (set `baseurl` to `"/<repo>"` for a project site)
- `_layouts/default.html`, `_includes/header.html`, `_includes/footer.html` – shared page chrome
- `index.html` (Home), `practice.html` (Practice), `documents.html` (Documents)
- `assets/css/style.css`, `assets/js/practice.js`
- `assets/questions.txt` – questions, parsed in the browser
- `assets/answers.json` – answers keyed by question ID: `choices` (list), `correct` (index into
  `choices`), `explain`, `ref`, and an optional `review` note (not shown on the site). Only questions
  that have an entry here can appear in an exam. Weapons are switched on in `assets/js/practice.js`
  (`IMPLEMENTED`); foil and épée are currently off.
- `docs/` – the rule PDFs linked from the Documents page