---
name: python-guidelines
description: Python coding standards, patterns, and project conventions. Use when writing, reviewing, or refactoring Python code.
---

# Python Guidelines

## Style & Formatting

- Use **4-space indentation**
- Keep code width under ~160 characters so it fits a standard screen without horizontal scrolling
- One line of code should implement one complete idea; use `:` to keep short `if` statements on one line
- Prefer one-line function definitions when the body fits comfortably on the same line as `def`
- Group related one-line functions together without blank lines between them
- Avoid trailing whitespace
- Don't use automatic linters/formatters (autopep8, yapf, black); hand-format code with domain understanding
- Don't add spaces around operators that represent domain notation (e.g. no spaces around `/` for pathlib)
- Use spacing around operators in equations to mimic mathematical layout
- Put all class member initializers together using destructuring assignment with no spaces after commas but spaces around `=`, e.g. `self.sz,self.denorm = sz,denorm`
- Prefer importing multiple modules on one line when it saves vertical space: `import PIL, os, numpy as np, math`
- Use `import *` when using nearly all of a module; define `__all__` in modules to control exports

## Symbol Naming

- Apply metaphorical Huffman Coding: commonly used things should have shorter names
- Assume domain knowledge: use `kl_divergence` not `kullback_leibler_divergence`; `nll` not `negative_log_likelihood`
- Use `o` for an object in a comprehension. Eg: `[o for o in values]`
- Use `i` for an index. Eg: `[i,o for i,o in enumerate(values)]`
- Use `k` and `v` for a key and value in a dictionary comprehension. Eg: `[(k,v) for k,v in some_dict.items()]`
- In lambdas with one function use `x` (eg: `lambda x: ...`), in case the value is a DataFrame use `d` (eg: `lambda d: ...`)

## Functions & Expressions

- Use list/dict/generator/set comprehensions liberally
- Use lambda functions for short expressions
- Use Python 3.6+ f-strings for formatting
- Use the ternary operator `x = y if a else b` for one-line conditionals
- Keep functions pure when possible; avoid mutating arguments

## Libraries

When working with these libraries, fetch their llms.txt for up-to-date docs:

- **nbdev**: <https://nbdev.fast.ai/llms.txt>
- **fastcore**: <https://fastcore.fast.ai/llms.txt>
- **fasthtml**: <https://www.fastht.ml/docs/llms.txt>

## Notebooks with nbdev

On projects using `nbdev` notebooks are the source of truth:

- we can careful edit python files and then run `nbdev-update` to update notebooks
- edit python files, no notebook files `nbs/*.ipynb`
- avoid reading notebook files
