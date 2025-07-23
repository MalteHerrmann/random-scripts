"""
This file contains the unit testing suite for the package to apply
the markdown line length to all *.md files in a given folder.
"""

import apply_markdown_linelengths as aml


def test_find_last_match_in_line():
    line = "This is a very long sentence which is definitely longer than it should be, either wanted or unwanted and also contains different identifiers, which can be used for splitting at good positions. It is also composed of two separate, unrelated sentences, which are on the same line."
    matches = aml.find_match_to_break_in_line(line)
    assert matches == "which"


# Using pytest's tmpdir fixture, which creates a temporary folder
# for test purposes
def test_apply_markdown_line_length(tmpdir):
    parts = [
        " 1. This is a very long sentence which is definitely longer than it should be,",
        "either wanted or unwanted",
        "and also contains different identifiers,",
        "which can be used for splitting at good positions.",
        "It is also composed of two separate, unrelated sentences, which are on the same line."
    ]
    tmp_file = tmpdir.join("test.md")
    tmp_file.write(" ".join(parts))

    line_lengths_applied = aml.apply_markdown_line_length(tmpdir)
    assert line_lengths_applied is True

    contents = tmp_file.read().split("\n")
    assert parts == contents
