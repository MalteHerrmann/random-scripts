package exec

import (
	"github.com/stretchr/testify/require"
	"testing"
)

func TestExecuteCommand(t *testing.T) {
	tests := []struct {
		name        string
		subCommands []string
		want        string
		expErr      bool
	}{
		{
			"pass - valid command",
			[]string{"q", "revenue", "params"},
			"",
			false,
		},
		{
			"fail - invalid command",
			[]string{"invalid command target"},
			"Unknown",
			true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, stderr, err := ExecuteCommand(tt.subCommands)
			if tt.expErr {
				require.Error(t, err, "expected error but none was returned")
				require.Contains(t, stderr, "unknown command", "resulting string did not contain the expected substring")
			} else {
				require.NoError(t, err, "expected no error but it occurred")
			}
		})
	}
}
