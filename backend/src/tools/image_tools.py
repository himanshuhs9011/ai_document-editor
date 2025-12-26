from langchain_core.tools import tool
from PIL import Image, ImageDraw, ImageFont
import io
import base64
from typing import Optional

# @tool
# def generate_photo(description: str, width: int= 200, height: int= 200, style: Optional[str] = None) -> str:
    """
    Generates a photo based on the provided description and style.
    
    Args:
        description (str): A textual description of the photo content.
        style (Optional[str]): The artistic style to apply to the photo. Default is None.
    
    Returns:
        Base64-encoded PNG image string or error message.
    """
    # try:
    #     # Create a blank image with white background
    #     img = Image.new("RGB", (width, height), color="white")
    #     draw = ImageDraw.Draw(img)

    #     description_text = description.lower()
        