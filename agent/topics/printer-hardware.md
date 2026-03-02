# Printer & Hardware Issues

This topic covers problems related to printers and hardware peripherals used with the platform. Issues include printers not printing, connection problems, and receipt or thermal printer setup. Most printer issues can be resolved through basic troubleshooting steps before escalation is needed.

## Type 1: Printer Not Printing

The user sends a print job from the platform but nothing prints, or the printer shows as offline.

### Flow

1. Ask the user to check that the printer is powered on and the status light indicates it is ready (usually a solid green light).
2. Ask the user to verify the cable connection between the printer and the computer (USB) or check that the printer is connected to the same network (for network printers).
3. Ask the user to open their operating system's printer settings (Windows: Settings > Devices > Printers & Scanners; macOS: System Settings > Printers & Scanners) and check if the printer shows as online.
4. Suggest the user try printing a test page from the OS printer settings to determine if the issue is with the platform or the printer itself.
5. If the test page prints successfully, the issue is likely with the platform's print settings. Ask the user to check Admin Panel > Settings > Printing to verify the correct printer is selected.
6. If the test page does not print, suggest restarting the printer by turning it off, waiting 10 seconds, and turning it back on.
7. If the issue persists, suggest removing the printer from the OS settings and adding it again.
8. If none of the above resolves the issue, collect details and escalate to live support.

## Type 2: Connection Issues

The user's printer is not being detected by their computer or keeps disconnecting.

### Flow

1. Ask the user to check the physical connection: ensure the USB cable is firmly plugged in at both ends, or verify Wi-Fi/network connectivity for wireless printers.
2. Suggest trying a different USB port or USB cable to rule out a faulty connection.
3. For network printers, ask the user to verify the printer is connected to the correct Wi-Fi network (the same network as the computer).
4. Suggest restarting both the printer and the computer.
5. Ask the user to check if the printer driver is installed. Direct them to the printer manufacturer's website to download the latest driver for their model and OS.
6. On Windows, suggest running the built-in printer troubleshooter (Settings > Devices > Printers & Scanners > Troubleshoot).
7. If the printer connects intermittently, suggest using a USB connection instead of Wi-Fi for more stable performance.
8. If the issue persists after all steps, collect details and escalate to live support.

## Type 3: Receipt / Thermal Printer Setup

The user needs to set up a receipt printer or thermal printer for use with the platform.

### Flow

1. Ask the user to connect the thermal printer to their computer via USB or network, depending on the printer model.
2. Ask the user to install the printer driver from the manufacturer's website or the included driver disk.
3. Direct the user to the operating system's printer settings to verify the thermal printer appears in the list of available printers.
4. Suggest printing a test page from the OS settings to confirm the printer is working at the hardware level.
5. Direct the user to Admin Panel > Settings > Printing > Receipt Printer to select the thermal printer and configure paper size and format.
6. Ask the user to print a test receipt from the platform to verify the setup is complete.
7. If the printout is blank, faded, or misaligned, suggest checking that the thermal paper is loaded correctly (the coated side must face the print head) and that the paper size settings match the actual paper width.
8. If the platform does not detect the thermal printer, suggest restarting the platform application after the driver is installed.

## Required Information

- Printer make and model
- Connection type (USB, Wi-Fi, Ethernet)
- Operating system (Windows, macOS, Linux)
- Error message (if any)

## Escalation

The bot can guide users through basic printer troubleshooting and setup. Escalation to live support is needed when the printer does not work after completing all troubleshooting steps, when the platform cannot detect a properly installed printer, or when the user needs help with an unsupported or specialized hardware device.

## Bot should

- Walk the user through checking power, connections, and driver installation before anything else.
- Suggest printing a test page from the OS to isolate whether the issue is with the printer or the platform.
- Provide OS-specific guidance for printer settings and troubleshooting.
- Help the user configure the printer within the platform's Admin Panel.
- Recommend checking paper loading direction for thermal printers.

## Bot should NOT

- Attempt to install drivers or configure the printer remotely.
- Recommend specific printer models or brands unless officially supported by the platform.
- Suggest opening the printer hardware or performing physical repairs.
- Assume the connection type or printer model without asking the user.
- Provide firmware update instructions unless specifically documented in the knowledge base.
