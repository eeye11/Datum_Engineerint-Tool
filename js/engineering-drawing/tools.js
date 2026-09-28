const drawingIcon = content => `<svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">${content}</svg>`;
const iconStroke = 'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"';

const toolIcons = {
	Select: drawingIcon(`<path ${iconStroke} d="M4 3l3 12 3-4 4 4 1-1-4-4 5-1z"/>`),
	Line: drawingIcon(`<path ${iconStroke} d="M4 16L16 4"/>`),
	Polyline: drawingIcon(`<path ${iconStroke} d="M3 14l4-8 5 5 5-7"/><circle ${iconStroke} cx="3" cy="14" r="1"/><circle ${iconStroke} cx="7" cy="6" r="1"/><circle ${iconStroke} cx="12" cy="11" r="1"/>`),
	Triangle: drawingIcon(`<path ${iconStroke} d="M10 3l7 13H3z"/><circle ${iconStroke} cx="10" cy="3" r="1"/>`),
	Polygon: drawingIcon(`<path ${iconStroke} d="M10 3l6 4v7l-6 3-6-3V7z"/>`),
	Arc: drawingIcon(`<path ${iconStroke} d="M4 14a7 7 0 0 1 10-9"/><path ${iconStroke} d="M13 5h2v2"/>`),
	Circle: drawingIcon(`<circle ${iconStroke} cx="10" cy="10" r="6"/>`),
	Rectangle: drawingIcon(`<rect ${iconStroke} x="4" y="5" width="12" height="10"/>`),
	"Construction Geometry": drawingIcon(`<path ${iconStroke} stroke-dasharray="2 2" d="M3 15L17 5"/>`),
	"Construction Line": drawingIcon(`<path ${iconStroke} stroke-dasharray="3 2" d="M3 15L17 5"/>`),
	"Centre Line": drawingIcon(`<path ${iconStroke} stroke-dasharray="5 2 1 2" d="M3 15L17 5"/>`),
	Move: drawingIcon(`<path ${iconStroke} d="M10 3v14M3 10h14M10 3l-2 2M10 3l2 2M10 17l-2-2M10 17l2-2M3 10l2-2M3 10l2 2M17 10l-2-2M17 10l-2 2"/>`),
	Rotate: drawingIcon(`<path ${iconStroke} d="M15 7a6 6 0 1 0 1 6"/><path ${iconStroke} d="M15 3v4h-4"/>`),
	Mirror: drawingIcon(`<path ${iconStroke} d="M10 3v14M4 6l4 4-4 4M16 6l-4 4 4 4"/>`),
	Trim: drawingIcon(`<path ${iconStroke} d="M4 5l11 10M15 5L4 15M3 10h6"/>`),
	Extend: drawingIcon(`<path ${iconStroke} d="M4 10h12M12 6l4 4-4 4M4 5v10"/>`),
	Pan: drawingIcon(`<path ${iconStroke} d="M6 10V6a1 1 0 0 1 2 0v3V4a1 1 0 0 1 2 0v5V5a1 1 0 0 1 2 0v4V6a1 1 0 0 1 2 0v6c0 3-2 5-5 5-2 0-3-1-4-3l-1-2a1 1 0 0 1 2-1z"/>`),
	Zoom: drawingIcon(`<circle ${iconStroke} cx="8.5" cy="8.5" r="4.5"/><path ${iconStroke} d="M12 12l4 4M8.5 6v5M6 8.5h5"/>`),
	"Smart Dimension": drawingIcon(`<path ${iconStroke} d="M4 6l2-2 2 2M6 4v12M4 14l2 2 2-2M11 5h5M11 10h4M11 15h5"/>`),
	"Note / Text": drawingIcon(`<path ${iconStroke} d="M4 4h12v9H9l-4 3v-3H4zM7 7h6M7 10h4"/>`),
	Leader: drawingIcon(`<path ${iconStroke} d="M4 15L15 5M12 5h4v4"/><circle ${iconStroke} cx="4" cy="15" r="1"/>`),
	Arrow: drawingIcon(`<path ${iconStroke} d="M4 16L16 4M11 4h5v5"/>`),
	Callout: drawingIcon(`<path ${iconStroke} d="M4 4h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path ${iconStroke} d="M6 7h5M6 10h3"/>`),
	Symbol: drawingIcon(`<circle ${iconStroke} cx="10" cy="10" r="6"/><path ${iconStroke} d="M7 10h6M10 7v6"/>`),
	Tolerance: drawingIcon(`<rect ${iconStroke} x="3" y="5" width="14" height="10"/><path ${iconStroke} d="M6 8l2 2-2 2M11 8h3M11 12h3"/>`),
	Table: drawingIcon(`<rect ${iconStroke} x="3" y="4" width="14" height="12"/><path ${iconStroke} d="M3 8h14M3 12h14M8 4v12M13 4v12"/>`),
	Reference: drawingIcon(`<path ${iconStroke} d="M4 4h12v12H4zM7 7h6M7 10h6M7 13h3"/>`),
	"Coordinate System": drawingIcon(`<path ${iconStroke} d="M4 16V4M4 16h12M4 16l3-3M4 16l3 1M16 16l-3-3M16 16l-3 1"/>`),
	"Reference Point": drawingIcon(`<circle ${iconStroke} cx="10" cy="10" r="2"/><path ${iconStroke} d="M10 3v4M10 13v4M3 10h4M13 10h4"/>`),
	"Reference Line": drawingIcon(`<path ${iconStroke} stroke-dasharray="3 2" d="M3 15L17 5"/><circle ${iconStroke} cx="3" cy="15" r="1"/><circle ${iconStroke} cx="17" cy="5" r="1"/>`),
	Moment: drawingIcon(`<path ${iconStroke} d="M6 14a6 6 0 1 1 7-9M13 5h3v3M10 10l3-3"/>`),
	Moments: drawingIcon(`<path ${iconStroke} d="M6 14a6 6 0 1 1 7-9M13 5h3v3M10 10l3-3"/>`),
	Support: drawingIcon(`<path ${iconStroke} d="M4 15h12M6 15l4-7 4 7M4 17h12"/>`),
	Supports: drawingIcon(`<path ${iconStroke} d="M4 15h12M6 15l4-7 4 7M4 17h12"/>`),
	Beam: drawingIcon(`<path ${iconStroke} d="M3 7h14v6H3zM6 7v6M14 7v6"/>`),
	Bodies: drawingIcon(`<path ${iconStroke} d="M5 7l5-3 5 3v6l-5 3-5-3zM5 7l5 3 5-3M10 10v6"/>`),
	Connections: drawingIcon(`<path ${iconStroke} d="M3 10h5M12 10h5M8 7h4v6H8z"/>`),
	Load: drawingIcon(`<path ${iconStroke} d="M10 3v11M7 11l3 3 3-3M5 17h10"/>`),
	Loads: drawingIcon(`<path ${iconStroke} d="M10 3v11M7 11l3 3 3-3M5 17h10"/>`),

	/*
	 * Statics feature icons.
	 *
	 * Every real Statics feature owns a distinct symbol here.
	 * These are the single authoritative artworks reused by the
	 * toolbar, the Feature Tree and the Features panel through
	 * featureIcons, so one feature never shows two different
	 * glyphs and no feature falls back to a generic Statics icon.
	 */
	Truss: drawingIcon(`<path ${iconStroke} d="M3 6h14M3 6l14 8M17 6L3 14M3 14h14M8 6v8M12 6v8"/>`),
	Cable: drawingIcon(`<path ${iconStroke} d="M3 5c5 8 9 8 14 0"/><circle ${iconStroke} cx="3" cy="5" r="1.2"/><circle ${iconStroke} cx="17" cy="5" r="1.2"/>`),
	"Point Force": drawingIcon(`<path ${iconStroke} d="M10 15V5"/><path ${iconStroke} d="M10 3l-3 4h6z"/><circle ${iconStroke} cx="10" cy="16.5" r="1.2"/>`),
	"Distributed Load": drawingIcon(`<path ${iconStroke} d="M2 5h16M6 6v7M10 6v7M14 6v7M6 10.5l-2 3h4zM10 10.5l-2 3h4zM14 10.5l-2 3h4z"/>`),
	"Varying Distributed Load": drawingIcon(`<path ${iconStroke} d="M2 5h16M3 6l2 4M7 6l2 7M10 6l2 10M13 6l2 7M17 6l2 4"/>`),
	"Applied Moment": drawingIcon(`<circle ${iconStroke} cx="10" cy="10" r="2"/><path ${iconStroke} d="M10 5.6a4.4 4.4 0 0 1 3.7 2"/><path ${iconStroke} d="M10 14.4a4.4 4.4 0 0 1-3.7-2"/><path ${iconStroke} d="M12.6 5.2l3 1.7-1.7 3"/><path ${iconStroke} d="M7.4 14.8l-3-1.7 1.7-3"/>`),
	Couple: drawingIcon(`<circle ${iconStroke} cx="5" cy="4" r="1.4"/><circle ${iconStroke} cx="15" cy="16" r="1.4"/><path ${iconStroke} d="M5 5.4v6.6M5 9l-2.6 3.2h5.2zM15 14.6V8M15 11l-2.6-3.2h5.2z"/><path ${iconStroke} d="M7.5 11.5h5"/>`),
	"Pin Support": drawingIcon(`<path ${iconStroke} d="M4 14h12M7 14l3-6 3 6"/><path ${iconStroke} d="M4 17h12"/><circle ${iconStroke} cx="10" cy="9" r="1.6"/>`),
	"Roller Support": drawingIcon(`<path ${iconStroke} d="M5 11h10M7 11l3-6 3 6"/><circle ${iconStroke} cx="7" cy="13.5" r="1.5"/><circle ${iconStroke} cx="13" cy="13.5" r="1.5"/><path ${iconStroke} d="M4 17h12"/>`),
	"Fixed Support": drawingIcon(`<path ${iconStroke} d="M8 3v12M8 15h6"/><path ${iconStroke} d="M8 15l-2.5 3M8 15l2.5 3"/><path ${iconStroke} d="M4 3v12M8 6h4M8 9h4M8 12h4"/>`),
	"Smooth Support": drawingIcon(`<path ${iconStroke} d="M5 12h10"/><path ${iconStroke} d="M8 12a2 2 0 0 1 4 0"/><path ${iconStroke} d="M4 15h12"/><path ${iconStroke} d="M4 17h12"/>`),
	"Pin Connection": drawingIcon(`<path ${iconStroke} d="M3 10h5M12 10h5"/><circle ${iconStroke} cx="10" cy="10" r="3"/><circle ${iconStroke} cx="10" cy="10" r="1"/>`),
	"Fixed Connection": drawingIcon(`<path ${iconStroke} d="M3 7h3v6H3zM14 7h3v6h-3zM6 8h8v4H6z"/><path ${iconStroke} d="M8 10h4M10 8v4"/>`),
	"Slider Connection": drawingIcon(`<path ${iconStroke} d="M3 8h4M3 12h4M13 10h4"/><path ${iconStroke} d="M8 6h4v8H8z"/><path ${iconStroke} d="M9 3h2M9 17h2"/>`),
	"Free Body Diagram": drawingIcon(`<rect ${iconStroke} x="5" y="5" width="10" height="10"/><path ${iconStroke} d="M10 2v3M10 15v3M2 10h3M15 10h3"/>`),
	Equilibrium: drawingIcon(`<path ${iconStroke} d="M10 4v12M4 8h12M6 8l-2 4h4zM14 8l-2 4h4z"/>`),
	Resultant: drawingIcon(`<path ${iconStroke} d="M4 16V6M4 16h10M4 16l4-4M4 16l-1-5M12 8l4-4"/>`),
	"Force Components": drawingIcon(`<path ${iconStroke} d="M4 16h12M4 16V4M4 16l9-9M13 7v4M13 7h-4"/>`),
	"Moment Analysis": drawingIcon(`<circle ${iconStroke} cx="10" cy="10" r="5"/><path ${iconStroke} d="M10 7v3l2 2M15 5l2-2"/>`),
	Particle: drawingIcon(`<circle ${iconStroke} cx="10" cy="10" r="2"/><path ${iconStroke} d="M10 3v5M10 12v5M3 10h5M12 10h5"/>`),
	"Rigid Body": drawingIcon(`<rect ${iconStroke} x="5" y="5" width="10" height="10"/><circle ${iconStroke} cx="10" cy="10" r="2"/>`),
	Velocity: drawingIcon(`<path ${iconStroke} d="M3 14h12M11 7l5 7-5 1"/>`),
	Acceleration: drawingIcon(`<path ${iconStroke} d="M3 14h12M11 6l5 8-5 2"/><path ${iconStroke} d="M6 8l3-3"/>`),
	Rotation: drawingIcon(`<path ${iconStroke} d="M15 7a6 6 0 1 0 1 6M15 3v4h-4"/>`),
	"Motion Path": drawingIcon(`<path ${iconStroke} d="M3 14c3-8 8 5 14-6"/><circle ${iconStroke} cx="3" cy="14" r="1"/><circle ${iconStroke} cx="17" cy="8" r="1"/>`),
	Pipe: drawingIcon(`<path ${iconStroke} d="M4 5v8a3 3 0 0 0 3 3h9M4 5h4M12 16v-5a2 2 0 0 1 2-2h2"/>`),
	Reservoir: drawingIcon(`<path ${iconStroke} d="M4 6h12v9H4zM4 9h12M7 4v2M13 4v2"/>`),
	Valve: drawingIcon(`<path ${iconStroke} d="M3 10h5l2-3 2 3h5M8 14l2-4 2 4M10 7V4"/>`),
	Pump: drawingIcon(`<circle ${iconStroke} cx="10" cy="10" r="5"/><path ${iconStroke} d="M10 5v5l3 2M3 10h2M15 10h2"/>`),
	"Flow Arrow": drawingIcon(`<path ${iconStroke} d="M3 10h12M11 6l4 4-4 4"/>`),
	Pressure: drawingIcon(`<circle ${iconStroke} cx="10" cy="11" r="6"/><path ${iconStroke} d="M10 11l3-3M7 4h6"/>`),
	"Control Volume": drawingIcon(`<rect ${iconStroke} x="4" y="5" width="12" height="10" stroke-dasharray="2 2"/><path ${iconStroke} d="M2 10h2M16 10h2"/>`),
	"System Boundary": drawingIcon(`<rect ${iconStroke} x="4" y="4" width="12" height="12" stroke-dasharray="3 2"/>`),
	"State Point": drawingIcon(`<circle ${iconStroke} cx="10" cy="10" r="2"/><path ${iconStroke} d="M10 3v5M10 12v5M3 10h5M12 10h5"/>`),
	"Process Path": drawingIcon(`<path ${iconStroke} d="M3 14c3-7 5 4 8-2s4-3 6-6"/><path ${iconStroke} d="M14 6h3v3"/>`),
	"Heat Transfer": drawingIcon(`<path ${iconStroke} d="M4 5c5 2 7 8 12 10M4 10c5 2 7 3 12 5"/>`),
	Work: drawingIcon(`<path ${iconStroke} d="M4 15h12M6 15V8h8v7M8 8V5h4v3"/>`),
	Wall: drawingIcon(`<path ${iconStroke} d="M6 3v14M10 3v14M14 3v14M3 5h14M3 10h14M3 15h14"/>`),
	Layer: drawingIcon(`<path ${iconStroke} d="M4 6h12M4 10h12M4 14h12"/>`),
	"Heat Flux": drawingIcon(`<path ${iconStroke} d="M4 10h12M12 6l4 4-4 4M7 6l-3 4 3 4"/>`),
	Temperature: drawingIcon(`<path ${iconStroke} d="M8 5a2 2 0 0 1 4 0v6a4 4 0 1 1-4 0zM10 4v8"/>`),
	Convection: drawingIcon(`<path ${iconStroke} d="M4 6c2-2 3 2 5 0s3 2 5 0 2 1 2 1M4 11c2-2 3 2 5 0s3 2 5 0 2 1 2 1"/>`),
	Radiation: drawingIcon(`<circle ${iconStroke} cx="10" cy="10" r="3"/><path ${iconStroke} d="M10 3v2M10 15v2M3 10h2M15 10h2M5 5l1 1M14 14l1 1M15 5l-1 1M6 14l-1 1"/>`),
	Shaft: drawingIcon(`<circle ${iconStroke} cx="10" cy="10" r="5"/><path ${iconStroke} d="M3 10h14M10 3v14"/>`),
	Stress: drawingIcon(`<path ${iconStroke} d="M4 15h12M4 15l3-8 3 5 3-7 3 10"/>`),
	Strain: drawingIcon(`<path ${iconStroke} d="M5 4v12M15 4v12M5 7h10M5 13h10"/>`),
	"Boundary Condition": drawingIcon(`<path ${iconStroke} d="M4 4v12M4 16h12M7 13l-3 3 3 1M13 13l3 3-3 1"/>`),
	Part: drawingIcon(`<path ${iconStroke} d="M5 7l5-3 5 3v6l-5 3-5-3zM5 7l5 3 5-3M10 10v6"/>`),
	Hole: drawingIcon(`<circle ${iconStroke} cx="10" cy="10" r="6"/><circle ${iconStroke} cx="10" cy="10" r="2"/>`),
	Gear: drawingIcon(`<circle ${iconStroke} cx="10" cy="10" r="3"/><path ${iconStroke} d="M10 3v3M10 14v3M3 10h3M14 10h3M5 5l2 2M13 13l2 2M15 5l-2 2M7 13l-2 2"/>`),
	Fastener: drawingIcon(`<path ${iconStroke} d="M6 4h8M6 7h8M8 7v9M12 7v9M5 16h10"/>`),
	"Section View": drawingIcon(`<path ${iconStroke} d="M4 4h12v12H4zM4 8h12M8 4v12"/>`),
	Block: drawingIcon(`<rect ${iconStroke} x="5" y="5" width="10" height="10"/><path ${iconStroke} d="M2 10h3M15 10h3"/>`),
	Input: drawingIcon(`<path ${iconStroke} d="M3 10h10M10 6l4 4-4 4"/>`),
	Output: drawingIcon(`<path ${iconStroke} d="M17 10H7M10 6l-4 4 4 4"/>`),
	Sensor: drawingIcon(`<path ${iconStroke} d="M6 14a6 6 0 0 1 0-8M10 16a8 8 0 0 1 0-12M14 10h3"/>`),
	Controller: drawingIcon(`<rect ${iconStroke} x="4" y="5" width="12" height="10"/><path ${iconStroke} d="M7 10h6M10 7v6"/>`),
	"Signal Arrow": drawingIcon(`<path ${iconStroke} d="M3 10h12M11 6l4 4-4 4"/><path ${iconStroke} d="M5 6v8"/>`),
	Point: drawingIcon(`<circle ${iconStroke} cx="10" cy="10" r="2"/>`),
	Function: drawingIcon(`<path ${iconStroke} d="M4 14c2-8 4 4 6-3s4-5 6-5"/>`),
	Vector: drawingIcon(`<path ${iconStroke} d="M4 15L15 4M10 4h5v5"/>`),
	Graph: drawingIcon(`<path ${iconStroke} d="M4 16V4M4 16h12M7 13l3-4 2 2 3-5"/>`),
	Equation: drawingIcon(`<path ${iconStroke} d="M4 6h4M6 4v4M10 10h6M4 15h4"/>`)
};

/*
 * Feature icons.
 *
 * The single authoritative icon for each feature type. The
 * toolbar reads the same artwork through toolIcons, and the
 * Feature Tree and the Features panel read it from here, so a
 * Particle or a Truss always shows the same symbol wherever it
 * appears. Every entry is a real feature type: a submenu
 * category such as Bodies or Loads is not a feature and has no
 * entry here, so no tree row is ever created for one.
 */
const featureIcons = {
	point: toolIcons.Point,
	particle: toolIcons.Particle,
	"rigid-body": toolIcons["Rigid Body"],
	beam: toolIcons.Beam,
	truss: toolIcons.Truss,
	cable: toolIcons.Cable,
	shaft: toolIcons.Shaft,

	force: toolIcons["Point Force"],
	moment: toolIcons["Applied Moment"],
	couple: toolIcons.Couple,

	load: toolIcons["Distributed Load"],
	"varying-load": toolIcons["Varying Distributed Load"],

	"pin-support": toolIcons["Pin Support"],
	"roller-support": toolIcons["Roller Support"],
	"fixed-support": toolIcons["Fixed Support"],
	"smooth-support": toolIcons["Smooth Support"],

	"pin-connection": toolIcons["Pin Connection"],
	"fixed-connection": toolIcons["Fixed Connection"],
	"slider-connection": toolIcons["Slider Connection"],

	"coordinate-system-2d": toolIcons["Coordinate System"]
};

const drawingToolGroups = [
	{
		id: "selection",
		label: "Selection",
		tools: [{ id: "select", label: "Select", shortcut: "Esc" }]
	},
	{
		id: "geometry",
		label: "Create",
		tools: [
			{ id: "point", label: "Point" },
			{ id: "line", label: "Line", shortcut: "L" },
			{ id: "triangle", label: "Triangle" },
			{ id: "rectangle", label: "Rectangle" },
			{ id: "circle", label: "Circle", shortcut: "C" },
			{ id: "arc", label: "Arc", shortcut: "A" },
			{ id: "polygon", label: "Polygon" }
		]
	},
	{
		id: "construction",
		label: "Construction",
		tools: [{ id: "coordinate-system", label: "Coordinate System" }]
	}
];

/*
 * Disciplines that are organised into labelled sections,
 * mirroring how the Geometry tools are grouped.
 *
 * Each entry lists section groups in display order. The
 * section labels match the wording used in the tool
 * panel headings.
 */
const disciplineToolGroups = {
	STATICS: [
		{
			id: "statics-selection",
			label: "Selection",
			tools: [{ id: "select", label: "Select", shortcut: "Esc" }]
		},
		{
			id: "statics-create",
			label: "Create",
			tools: [
				{ id: "body", label: "Bodies", submenu: true },

				/*
				 * A Point Force is a single direct tool, in
				 * the same way Line and Circle are. It has no
				 * submenu and opens no popup before drawing.
				 */
				{ id: "point-force", label: "Point Force" },

				{ id: "load", label: "Loads", submenu: true },
				{ id: "moment", label: "Moments", submenu: true },
				{ id: "support", label: "Supports", submenu: true },
				{ id: "connection", label: "Connections", submenu: true }
			]
		},
		{
			id: "statics-analysis",
			label: "Analysis",
			tools: [
				{ id: "free-body-diagram", label: "Free Body Diagram" },
				{ id: "resultant", label: "Resultant" },
				{ id: "force-components", label: "Force Components" },
				{ id: "equilibrium", label: "Equilibrium" },
				{ id: "moment-analysis", label: "Moment Analysis" }
			]
		},
		{
			id: "statics-reference",
			label: "Reference",
			tools: [
				{ id: "coordinate-system", label: "Coordinate System" },
				{ id: "reference-point", label: "Reference Point" },
				{ id: "reference-line", label: "Reference Line" }
			]
		}
	]
};

const globalToolGroups = [
	{
		id: "modify",
		label: "Modify",
		tools: [
			{ id: "move", label: "Move" },
			{ id: "rotate", label: "Rotate" },
			{ id: "mirror", label: "Mirror" },
			{ id: "trim", label: "Trim" },
			{ id: "extend", label: "Extend" }
		]
	},
	{
		id: "view",
		label: "View",
		tools: [
			{ id: "pan", label: "Pan" },
			{ id: "zoom", label: "Zoom" },
			{ id: "fit", label: "Fit" }
		]
	}
];

const sidebarToolDefinitions = drawingToolGroups.flatMap(group => group.tools);
const globalToolDefinitions = globalToolGroups.flatMap(group => group.tools);
const drawToolDefinitions = [
	...sidebarToolDefinitions,
	...globalToolDefinitions
];
const drawToolLabelById = Object.fromEntries(drawToolDefinitions.map(tool => [tool.id, tool.label]));

const engineeringTools = {
	GEOMETRY: sidebarToolDefinitions.map(tool => tool.label),
	ANNOTATE: ["Smart Dimension", "Note / Text", "Leader", "Arrow", "Callout", "Symbol", "Tolerance", "Table", "Reference"],
	STATICS: ["Particle", "Rigid Body", "Beam", "Truss", "Cable", "Shaft", "Point Force", "Distributed Load", "Varying Distributed Load", "Applied Moment", "Couple", "Pin Support", "Roller Support", "Fixed Support", "Smooth Support", "Pin Connection", "Fixed Connection", "Slider Connection", "Free Body Diagram"],
	DYNAMICS: ["Particle", "Rigid Body", "Velocity", "Acceleration", "Rotation", "Motion Path"],
	FLUIDS: ["Pipe", "Reservoir", "Valve", "Pump", "Flow Arrow", "Pressure"],
	THERMODYNAMICS: ["Control Volume", "System Boundary", "State Point", "Process Path", "Heat Transfer", "Work"],
	"HEAT TRANSFER": ["Wall", "Layer", "Heat Flux", "Temperature", "Convection", "Radiation"],
	"SOLID MECHANICS": ["Beam", "Shaft", "Load", "Stress", "Strain", "Boundary Condition"],
	"MECHANICAL DESIGN": ["Part", "Hole", "Shaft", "Gear", "Fastener", "Section View"],
	CONTROLS: ["Block", "Input", "Output", "Sensor", "Controller", "Signal Arrow"],
	"MATH / ANALYSIS": ["Point", "Function", "Vector", "Graph", "Equation"]
};
