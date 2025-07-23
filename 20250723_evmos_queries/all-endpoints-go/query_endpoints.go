package main

import (
	"log"
	"strings"

	"github.com/MalteHerrmann/evmosd-queries/exec"
)

func main() {
	var commands [][]string
	var failedCommands []string

	//commands, err := exec.GetEvmosdQueryCommands()
	//if err != nil {
	//	log.Fatalf("Couldn't get evmosd query targets: %v", err)
	//}

	commands = append(commands, []string{"q"})

	for _, subcommand := range commands {
		_, stdErr, err := exec.ExecuteCommand(subcommand)
		if err != nil {
			log.Fatal(err)
		}

		if stdErr != "" {
			failedCommands = append(
				failedCommands,
				strings.Join(subcommand, " "),
			)
		}
	}
}
