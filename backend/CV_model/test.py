from ultralytics import YOLO
import cv2

# --- Settings ---
model_path = "backend/CV_model/best.pt"   # path to your trained weights
image_path = "backend/sample_pothole_images/3.jpeg"
conf_thresh = 0.5
# ----------------

# Load your local YOLO model
model = YOLO(model_path)

# Run inference on the image
results = model.predict(image_path, conf=conf_thresh)

# Read original image
img = cv2.imread(image_path)

# Draw bounding boxes from results
for box in results[0].boxes:
    conf = float(box.conf)
    if conf < conf_thresh:
        continue

    x1, y1, x2, y2 = map(int, box.xyxy[0])
    label = f"Pothole {conf:.2f}"

    cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
    cv2.putText(img, label, (x1, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

# Show and save
cv2.imshow("Annotated Potholes", img)
cv2.waitKey(0)
cv2.destroyAllWindows()

cv2.imwrite("annotated_local.jpg", img)
print("✅ Saved annotated image as annotated_local.jpg")
