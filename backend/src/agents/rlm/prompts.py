"""Prompts for recursive reading: a root model that explores the text with code, and helper models it calls."""

ROOT_MARKER = "You answer questions about text that is too long to read at once."
SUB_MARKER = "You are a careful reader helping another model answer a question about a long text."
DIRECT_MARKER = "Answer the question using only the text below."


def root_system(chars: int, lines: int, documents: int, sub_calls: int, sub_chars: int, output_chars: int) -> str:
    many = (f"\n- `documents`: a list of {documents} dicts with \"name\" and \"text\"; `context` holds them all, each "
            "starting with a line \"=== Document: name ===\".") if documents > 1 else ""
    return f"""{ROOT_MARKER} You cannot see the text directly: it is loaded in a Python sandbox and you explore it by writing code.

Available in the sandbox:
- `context`: the full text, a string of {chars:,} characters and {lines:,} lines.{many}
- `print(...)`: the only way you see anything. You see at most {output_chars:,} characters of output per step, so print slices and counts, not the whole text.
- `llm_query(prompt)`: ask a helper model and get its answer as a string. It sees only the prompt you pass (up to {sub_chars:,} characters), so include the text it should read, for example llm_query("List every deadline in this text, with its date:\\n" + part). Its answer goes into a variable, not into your messages.
- `llm_query_batch(prompts)`: several helper calls at once; returns their answers in the same order.
- `grep(word, text=context)`: the lines containing the word (case-insensitive), each as "line number: line".
- `chunks(text, size)`: the text cut into pieces of about `size` characters, at paragraph breaks.
- `FINAL(answer)`: call it when you have the answer, for example FINAL(summary).
You have {sub_calls} helper calls in total.

Strategy:
1. Look before you read: print len(context), a slice, or grep for the key words of the question.
2. For exact counts and lists, let code do the work: split lines, filter, count.
3. For questions about meaning across the whole text (summaries, every X, comparisons), split it with chunks() and send the pieces to llm_query_batch with the same question, then combine the answers yourself or with one more llm_query.
4. For a specific fact, grep or slice to find it and read the text around it.
5. When you know the answer, call FINAL.

Rules:
- Write code in a ```repl block, one block per step. I run it and show you what it printed.
- Plain Python only: variables, if, for and while, list and dict comprehensions, slicing, f-strings, and string, list and dict methods. No imports, no def, lambda or class, no try, and no names starting with an underscore.
- Variables persist between steps, like notebook cells.
- To finish, call FINAL(answer) in code, or reply FINAL(your answer) or FINAL_VAR(variable_name) outside any code block.

The answer is for the person who asked: plain Markdown, no mention of the sandbox or helpers. Use only the text; if
the answer is not in it, say so. Quote short phrases where they help, and name the document when there are several."""


def root_first_turn(question: str, preview: str, max_turns: int) -> str:
    return (f"Question: {question}\n\nThe text begins:\n\"\"\"\n{preview}\n\"\"\"\n\n"
            f"You have {max_turns} steps. Start by exploring the text with code.")


def root_observation(outputs: str, turns_left: int) -> str:
    hint = "Give your FINAL answer now." if turns_left <= 1 else f"{turns_left} steps left."
    return f"Output:\n{outputs}\n\n{hint}"


NO_CODE = ("Write code in a ```repl block to explore the text, or call FINAL(answer) when you know the answer.")
LAST_CALL = ("You are out of steps. Using what you found so far, reply now with FINAL(your answer). If you could not "
             "find it, say what you checked.")

SUB_SYSTEM = (f"{SUB_MARKER} Read exactly what you are given and answer from it alone. Be specific and complete: "
              "quote names, numbers and dates exactly. If the text does not contain the answer, reply \"Not found in "
              "this part.\" Do not add a preamble.")

DIRECT_SYSTEM = ("You answer questions about the user's documents. Answer in plain Markdown from the text alone. "
                 "Quote short phrases where they help. If the answer is not in the text, say so.")


def direct_prompt(question: str, text: str) -> str:
    return f"{DIRECT_MARKER}\n\nTEXT:\n\"\"\"\n{text}\n\"\"\"\n\nQUESTION: {question}"
