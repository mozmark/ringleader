Service Commands
================

Introduction
------------
Service Commands are a way of creating commands (e.g. GCLI commands) from a web service.

Commands are defined in a JSON descriptor (which looks a little like a GCLI [command definition](https://github.com/mozilla/gcli/blob/master/docs/writing-commands.md))

The Descriptor:
---------------
The descriptor is a JSON document containing a list of commands:
```json
{
  "commands":[]
}
```

A command is created for each item in the list. The first command should be empty with the exception of a description: This gives your users information on what your tool does. e.g:

if you load a command with the prefix 'test' and the following descriptor:

```json
{
  "commands":[{"description":"this is an example"}]
}
```

then typing 'test' at the command line will give you "this is an example command".

You probably want commands to be a bit more interesting than this, though. Here's a slightly more interesting example:

```json
{
  "name": "command",
  "description": "take a parameter, do something",
  "returnType": "string",
  "params": [{
    "name": "param1",
    "type": "string",
    "description": "the parameter to do something with"
  }],
  "execAction": {
    "url": "http://localhost:3000/do/something?param1=${param1}",
    "expression": "$.Result",
    "callbackData": {
      "foo": "bar",
      "wibble": {
        "type": "expression",
        "expression": "$.response.Result",
        "extract": true
      }
    }
  }
}
```
