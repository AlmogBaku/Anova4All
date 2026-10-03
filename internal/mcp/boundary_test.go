package mcp_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// Only internal/control talks to cookers (internal/cook drives control and the cooker
// events). Every other package, MCP and REST included, reaches a cooker through control.
var cookerCallers = map[string]bool{"internal/control": true, "internal/cook": true}

// commandUsers are the only non-test importers of pkg/commands outside pkg/.
var commandUsers = map[string]bool{"internal/control": true, "internal/cook": true}

type goFile struct {
	dir  string // relative to the repo root, slash-separated
	file *ast.File
	name string
}

func repoFiles(t *testing.T) []goFile {
	t.Helper()
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	var out []goFile
	fset := token.NewFileSet()
	for _, top := range []string{"internal", "cmd", "pkg"} {
		err := filepath.WalkDir(filepath.Join(root, top), func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() && (d.Name() == "testdata" || d.Name() == "node_modules") {
				return filepath.SkipDir
			}
			if d.IsDir() || !strings.HasSuffix(p, ".go") || strings.HasSuffix(p, "_test.go") {
				return nil
			}
			f, err := parser.ParseFile(fset, p, nil, parser.SkipObjectResolution)
			if err != nil {
				return err
			}
			rel, _ := filepath.Rel(root, filepath.Dir(p))
			out = append(out, goFile{dir: filepath.ToSlash(rel), file: f, name: filepath.Base(p)})
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	if len(out) == 0 {
		t.Fatal("no Go files found")
	}
	return out
}

func imports(f *ast.File) []string {
	var out []string
	for _, im := range f.Imports {
		p, _ := strconv.Unquote(im.Path.Value)
		out = append(out, p)
	}
	return out
}

func TestOnlyControlTalksToCookers(t *testing.T) {
	for _, gf := range repoFiles(t) {
		if cookerCallers[gf.dir] || strings.HasPrefix(gf.dir, "pkg/wifi") {
			continue // pkg/wifi implements the calls
		}
		ast.Inspect(gf.file, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			if sel, ok := call.Fun.(*ast.SelectorExpr); ok && (sel.Sel.Name == "SendCommand" || sel.Sel.Name == "ReadKey") {
				t.Errorf("%s/%s calls .%s: only internal/control may talk to a cooker", gf.dir, gf.name, sel.Sel.Name)
			}
			return true
		})
	}
}

func TestPackageBoundaries(t *testing.T) {
	for _, gf := range repoFiles(t) {
		for _, im := range imports(gf.file) {
			switch {
			case gf.dir == "internal/mcp" && (im == "anova4all/internal/rest" || strings.HasPrefix(im, "anova4all/pkg/")):
				t.Errorf("internal/mcp/%s imports %s: MCP goes through control only", gf.name, im)
			case gf.dir == "internal/rest" && im == "anova4all/internal/mcp":
				t.Errorf("internal/rest/%s imports internal/mcp: main wires them", gf.name)
			case im == "anova4all/pkg/commands" && !strings.HasPrefix(gf.dir, "pkg/") && !commandUsers[gf.dir]:
				t.Errorf("%s/%s imports pkg/commands: only control and cook build cooker commands", gf.dir, gf.name)
			}
		}
	}
}
