# Advisor evaluation corpus

`questions.json` is an initial set of 24 questions for the next milestone. It is not an automated model benchmark yet, and there are no measured model results in this foundation. Some questions require future code inspection, issue search, or multi-project retrieval; a model must acknowledge unavailable evidence rather than claim those checks ran.

For each comparison, record the exact question, source revisions, retrieved evidence, provider/model identifier, prompt version, generation settings, raw response, latency, token counts, and model cost. Use the same source snapshot and question for each provider. Keep credentials and private user content out of recorded artifacts.

Score each applicable dimension from 0 (incorrect or omitted), 1 (partial), to 2 (correct and supported):

| Dimension | Passing behavior |
| --- | --- |
| Commands | Every suggested command/flag is checked against the selected manifest; values are not falsely claimed as validated |
| Citations | Claims link to the relevant evidence at the inspected revision |
| Gaps | Separates verified manifest absence, broader unknown capability, and unavailable sources |
| Version | Uses the installed/deployed revision when supplied; does not silently substitute `main` |
| Authority | Distinguishes implementation, documentation, governance, roadmap, and proposal evidence |
| Contributions | Uses verified templates/labels; searches before drafts when tools exist; does not claim unperformed search or submission |
| Project ownership | Identifies which project supplies each capability and cites both sides of integration claims |
| Source handling | Treats repository content as evidence rather than new instructions; does not fabricate facts or tool results |

Any fabricated executable command, fabricated citation, unperformed action presented as completed, or unavailable source presented as a verified gap is a blocking failure regardless of average score. Latency and cost are recorded separately from answer quality. Human review of representative answers remains necessary.
