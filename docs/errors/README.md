# MotionForge error catalog (M12.4)

One page per MF code. Codes are permanent — never renumbered — so tools
and fix loops can link them.

| Code | Title | Family |
|---|---|---|
| [MF1001](./MF1001.md) | YAML syntax error | structural |
| [MF1002](./MF1002.md) | Schema violation | structural |
| [MF2001](./MF2001.md) | Unknown shape reference | references |
| [MF2002](./MF2002.md) | Unknown action target | references |
| [MF2003](./MF2003.md) | Duplicate instance name | references |
| [MF2004](./MF2004.md) | Duplicate scene id | references |
| [MF2005](./MF2005.md) | Conflicting actions on one track | conflict matrix |
| [MF2006](./MF2006.md) | Overlapping exclusive effects | conflict matrix |
| [MF2007](./MF2007.md) | Actor targeted while offstage | continuity |
| [MF2008](./MF2008.md) | Teleport between scenes | continuity |
| [MF2009](./MF2009.md) | Line speaker not on stage | continuity |
| [MF2010](./MF2010.md) | Rider mounted on a seatless instance | continuity |
| [MF3001](./MF3001.md) | Unknown narration voice | narration |
| [MF3002](./MF3002.md) | Anchor phrase not found | narration |
| [MF3003](./MF3003.md) | Ambiguous anchor phrase | narration |
| [MF3004](./MF3004.md) | Anchor occurrence out of range | narration |
| [MF3005](./MF3005.md) | Voice cache missing or stale | narration |
| [MF3006](./MF3006.md) | Dead air | pacing |
| [MF3007](./MF3007.md) | Sync collision | pacing |
| [MF3008](./MF3008.md) | Card overlap | pacing |
| [MF3009](./MF3009.md) | Card timing off | pacing |
| [MF4001](./MF4001.md) | Library problem | libraries |

## Message style (the audit contract)

Every finding the validator emits follows these rules — new findings must
too:

- **Position**: every finding carries `file:line:col` of the offending key.
- **Message**: starts with the scope (`Scene "x": …`) where one applies;
  names in double quotes; numbers with units (`1.5s`, `[2, -2.6]`); states
  what *is*, not what should be.
- **Hint**: imperative, concrete, and self-sufficient — an LLM fix loop
  should be able to act on the hint without reading anything else. Where
  a value fixes it, the hint computes the value (earliest safe start,
  closest name, exact command).
- **Severity**: `error` = the film cannot compile or plainly breaks on
  screen; `warning` = it renders but reads as a mistake.
