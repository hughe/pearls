/**
 * Shell completion scripts, printed by `pearls completions <shell>`.
 *
 * Keeping the scripts here (rather than as loose files under completions/)
 * means they ship inside the published `dist/` build, so users can install
 * them with a redirect instead of copying files out of the repo:
 *
 *   pearls completions zsh > "${fpath[1]}/_pearls"
 *
 * Template-literal escapes to know about when editing ZSH_COMPLETION:
 *   - `\${` produces a literal `${` (zsh parameter expansion)
 *   - there are no backticks in the script, so none need escaping
 */
export const ZSH_COMPLETION = `#compdef pearls
# Zsh completion for pearls.
#
# Install one of:
#   pearls completions zsh > "\${fpath[1]}/_pearls"
#   mkdir -p ~/.zfunc && pearls completions zsh > ~/.zfunc/_pearls
#     (with 'fpath=(~/.zfunc \$fpath)' and 'autoload -Uz compinit; compinit'
#      in your .zshrc)

# Complete pearl ids as "T<hex>:title" pairs read from 'pearls list-all'.
_pearls_ids() {
	local -a ids
	ids=(\${(f)"\$(command pearls list-all 2>/dev/null \\
		| sed -nE 's/^[ |│├└─]*([TM][0-9a-f]{8}) \\[[^]]*\\] (.*) \\((open|closed|done)\\)$/\\1:\\2/p' \\
		| sed -E 's/ \\(assigned: [^)]*\\)//')"})
	(( \${#ids[@]} )) && _describe -t ids 'pearl id' ids
}

_pearls() {
	local curcontext="\$curcontext" state line
	local -A opt_args
	local -a global_opts commands

	global_opts=(
		'--pearls-dir[override the todos directory]: :_directories'
		'--session[session id used for claim/release]:session id'
		'--json[emit stable JSON output]'
		'--color[force colorized output]'
		'--no-color[disable colorized output]'
		'--no-gc[skip startup garbage collection]'
		'(-h --help)'{-h,--help}'[show help]'
		'--version[print version and exit]'
	)

	_arguments -C \\
		\$global_opts \\
		'1:command:->command' \\
		'*::arguments:->arguments'

	commands=(
		'list:list open and assigned todos'
		'list-all:list every todo including closed'
		'search:filter todos by fuzzy text, priority or parent'
		'get:print a single todo'
		'show:alias for get'
		'create:create a new todo'
		'new:alias for create'
		'add:alias for create'
		'update:update a todo'
		'edit:alias for update'
		'append:append markdown to a todo body'
		'delete:delete a todo'
		'rm:alias for delete'
		'close:close a todo'
		'reopen:reopen a todo'
		'open:alias for reopen'
		'claim:claim a todo for the current session'
		'release:release the session assignment'
		'memories:list memories'
		'dir:print the resolved todos directory'
		'path:print the path to a todo file'
		'reslug:re-derive the filename slug from the title'
		'migrate-filenames:rename old todo files to the current scheme'
		'summarize-memories:list the memory index'
		'refine:print a refinement prompt for a todo'
		'quickstart:print an agent-oriented guide'
		'completions:print shell completion scripts'
		'help:show help'
	)

	case \$state in
		command)
			_describe -t commands 'pearls command' commands
			;;
		arguments)
			case \${words[1]} in
				list)
					_arguments '--json[emit stable JSON output]'
					;;
				list-all)
					_arguments \\
						'--archived[include archived todos]' \\
						'--json[emit stable JSON output]'
					;;
				search)
					_arguments \\
						'(-f --fuzzy)'{-f,--fuzzy}'[fuzzy-match term]:term' \\
						'(-p --priority)'{-p,--priority}'[exact priority match]:priority:(0 1 2 3 4)' \\
						'(-c --child-of)'{-c,--child-of}'[children of id]:pearl id:_pearls_ids' \\
						'--closed[include closed todos]' \\
						'--json[emit stable JSON output]'
					;;
				get|show)
					_arguments '1:pearl id:_pearls_ids' '--json[emit stable JSON output]'
					;;
				create|new|add)
					_arguments \\
						'1:title' \\
						'--title[set the title]:title' \\
						'--tag[add a tag (repeatable)]:tag' \\
						'--status[set status]:status:(open closed done)' \\
						'--priority[priority 0-4]:priority:(0 1 2 3 4)' \\
						'--parent[parent id]:pearl id:_pearls_ids' \\
						'--body[body text]:text' \\
						'--body-file[read body from file]:file:_files' \\
						'--stdin-body[read body from stdin]' \\
						'--type[entry type]:type:(todo memory)' \\
						'--slug[filename slug]:slug' \\
						'--json[emit stable JSON output]'
					;;
				update|edit)
					_arguments \\
						'1:pearl id:_pearls_ids' \\
						'--title[set the title]:title' \\
						'--tag[replace tags (repeatable)]:tag' \\
						'--status[set status]:status:(open closed done)' \\
						'--priority[priority 0-4]:priority:(0 1 2 3 4)' \\
						'--parent[parent id (empty to clear)]:pearl id:_pearls_ids' \\
						'--body[body text]:text' \\
						'--body-file[read body from file]:file:_files' \\
						'--stdin-body[read body from stdin]' \\
						'--slug[rename to filename slug]:slug' \\
						'--json[emit stable JSON output]'
					;;
				append)
					_arguments \\
						'1:pearl id:_pearls_ids' \\
						'--body[body text]:text' \\
						'--body-file[read body from file]:file:_files' \\
						'--stdin-body[read body from stdin]' \\
						'--json[emit stable JSON output]'
					;;
				delete|rm)
					_arguments \\
						'1:pearl id:_pearls_ids' \\
						'--quiet[suppress output]' \\
						'--json[emit stable JSON output]'
					;;
				close|reopen|open)
					_arguments '1:pearl id:_pearls_ids' '--json[emit stable JSON output]'
					;;
				claim|release)
					_arguments \\
						'1:pearl id:_pearls_ids' \\
						'--force[override another session'"'"'s assignment]' \\
						'--json[emit stable JSON output]'
					;;
				path)
					_arguments '1:pearl id:_pearls_ids'
					;;
				reslug)
					_arguments \\
						'1:pearl id:_pearls_ids' \\
						'--quiet[suppress output]' \\
						'--json[emit stable JSON output]'
					;;
				refine)
					_arguments '1:pearl id:_pearls_ids' '--json[emit stable JSON output]'
					;;
				migrate-filenames)
					_arguments \\
						'--dry-run[preview renames without applying]' \\
						'--force[disambiguate an already-taken name]'
					;;
				summarize-memories)
					_arguments \\
						'--closed[include closed memories]' \\
						'--json[emit stable JSON output]'
					;;
				completions)
					_arguments '1:shell:(zsh)'
					;;
			esac
			;;
	esac
}

_pearls "\$@"
`;
