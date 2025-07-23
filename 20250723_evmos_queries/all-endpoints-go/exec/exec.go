// Package exec contains functions that execute commands
// on the operating system level similar to shell scripts.
package exec

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"
)

const (
	// binaryName is the executed command target
	binaryName string = "evmosd"
)

// ExecuteCommand takes a slice of strings that each resemble a subcommand
// for the Evmos binary and executes the resulting command. If the command
// is not valid for the Evmos binary, the printed messages to stderr are
// returned.
func ExecuteCommand(subCommands []string) (string, string, error) {
	var stdErr, stdOut bytes.Buffer
	cmd := exec.Command(
		binaryName,
		subCommands...,
	)
	cmd.Stdout = &stdOut
	cmd.Stderr = &stdErr

	err := cmd.Run()
	if err != nil {
		return stdOut.String(), stdErr.String(), fmt.Errorf("error while trying to execute command '%s %s': %s", binaryName, strings.Join(subCommands, " "), err)
	}

	return stdOut.String(), stdErr.String(), nil
}
