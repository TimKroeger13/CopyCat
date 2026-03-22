@echo off
set DOTNET_WATCH_RESTART_ON_RUDE_EDIT=1
set DOTNET_WATCH_SUPPRESS_LAUNCH_BROWSER=1

start "CopyCat Server" cmd /k "cd /D %~dp0CopyCat.Server && dotnet watch run"