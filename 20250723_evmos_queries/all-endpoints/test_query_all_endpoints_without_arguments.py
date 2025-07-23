"""
This file contains the unit testing suite for the script to
query all Evmos endpoints, that do not require passing any
arguments.
"""

import query_all_endpoints_without_arguments as queries


class TestExecuteSystemCallAndReturnError:
    def test_execute_system_call_and_return_error_wrong_command_should_return_error(self):
        error = queries.execute_system_call_and_return_error("unknownCommand test 123")
        # TODO: Check why this is always false
        assert b'FileNotFoundError' in error

    def test_execute_system_call_and_return_error_command_should_not_return_error(self):
        error = queries.execute_system_call_and_return_error("ls")
        assert error == b''
