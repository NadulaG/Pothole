from inference_sdk import InferenceHTTPClient
import cv2

# --- Settings ---
api_key = "TJKVvtTRokcRh0CEzgCg"
model_id = "pothole-clzln/1"
image_path = "backend/sample_pothole_images/3.jpeg"
conf_thresh = 0.5
# ----------------

client = InferenceHTTPClient(
    api_url="https://detect.roboflow.com",
    api_key=api_key
)

# Run inference (old SDKs return only JSON)
result = client.infer(image_path, model_id)

# Read original image
img = cv2.imread(image_path)

# Draw returned boxes
for pred in result["predictions"]:
    if pred["confidence"] < conf_thresh:
        continue
    x1, y1 = int(pred["x"] - pred["width"]/2), int(pred["y"] - pred["height"]/2)
    x2, y2 = int(pred["x"] + pred["width"]/2), int(pred["y"] + pred["height"]/2)
    label = f"{pred['class']} {pred['confidence']:.2f}"

    cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
    cv2.putText(img, label, (x1, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

cv2.imshow("Annotated Potholes", img)
cv2.waitKey(0)
cv2.destroyAllWindows()

cv2.imwrite("annotated.jpg", img)
print("✅ Saved annotated image as annotated.jpg")