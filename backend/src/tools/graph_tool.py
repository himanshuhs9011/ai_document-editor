from langchain_core.tools import tool
import plotly.express as px
import plotly.graph_objects as go
import json
import base64
import io

def fig_to_base64(fig) -> str:
    """Convert Plotly figure to base64 PNG string."""
    buf = io.BytesIO()
    fig.write_image(buf, format="png")
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode("utf-8")
    return f"data:image/png;base64,{img_base64}"

@tool
def generate_graphs(data: str) -> str:
    """
    Generate one or more graphs from JSON input and return them as base64-encoded PNGs.
    
    Args:
        data: JSON string with a "graphs" list. Each item should include:
              - "type": graph type (e.g., bar, line, scatter, area, histogram, box, pie, violin, heatmap)
              - "x": list of x values (when applicable)
              - "y": list of y values (when applicable)
              - "title": optional title
              - additional fields depending on graph type (e.g., "z" for heatmap, "labels" and "values" for pie)
    
    Returns:
        JSON string containing base64-encoded PNGs for each graph along with metadata.
    """
    try:
        parsed_data = json.loads(data)
        graphs = parsed_data.get("graphs", [])
        
        if not graphs:
            return "Error: No graphs provided. Provide a list under 'graphs'."

        results = []
        for g in graphs:
            gtype = g.get("type", "").lower()
            title = g.get("title", None)
            fig = None

            try:
                # --- Common charts ---
                if gtype == "bar":
                    fig = px.bar(x=g.get("x", []), y=g.get("y", []), title=title)
                elif gtype == "line":
                    fig = px.line(x=g.get("x", []), y=g.get("y", []), title=title)
                elif gtype == "scatter":
                    fig = px.scatter(x=g.get("x", []), y=g.get("y", []), title=title)
                elif gtype == "area":
                    fig = px.area(x=g.get("x", []), y=g.get("y", []), title=title)
                elif gtype == "histogram":
                    fig = px.histogram(x=g.get("x", []), title=title)
                elif gtype == "box":
                    fig = px.box(x=g.get("x", []), y=g.get("y", []), title=title)
                elif gtype == "violin":
                    fig = px.violin(x=g.get("x", []), y=g.get("y", []), title=title, box=True, points="all")
                elif gtype == "pie":
                    fig = px.pie(names=g.get("labels", []), values=g.get("values", []), title=title)
                elif gtype == "heatmap":
                    fig = go.Figure(data=go.Heatmap(z=g.get("z", []), x=g.get("x", []), y=g.get("y", [])))
                    fig.update_layout(title=title)
                else:
                    results.append({"error": f"Unsupported graph type: {gtype}"})
                    continue

                # Convert to base64
                img_base64 = fig_to_base64(fig)
                results.append({
                    "type": gtype,
                    "title": title,
                    "image": img_base64
                })
            
            except Exception as inner_e:
                results.append({"error": f"Failed to generate {gtype} graph: {str(inner_e)}"})
        
        return json.dumps(results)

    except Exception as e:
        return f"Error generating graphs: {str(e)}"

# Export tools for LangChain
tools = [generate_graphs]
