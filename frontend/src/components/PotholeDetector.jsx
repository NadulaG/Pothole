"use client"

import { useState } from "react"
import "./PotholeDetector.css"

export default function PotholeDetector() {
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState("")

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setImage(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    // Here you would handle the form submission
    console.log({
      image,
      description,
      location,
    })

    alert("Pothole report submitted successfully!")

    // Reset form
    setImage(null)
    setImagePreview(null)
    setDescription("")
    setLocation("")
  }

  const removeImage = () => {
    setImage(null)
    setImagePreview(null)
  }

  return (
    <div className="pothole-container">
      <div className="pothole-card">
        <div className="card-header">
          <h1 className="card-title">Report a Pothole</h1>
          <p className="card-description">Help us improve road safety by reporting potholes in your area</p>
        </div>

        <form onSubmit={handleSubmit} className="form">
          {/* Image Upload Section */}
          <div className="form-group">
            <label className="form-label">
              Pothole Image <span className="required">*</span>
            </label>
            <div className="upload-container">
              {!imagePreview ? (
                <label htmlFor="image-upload" className="upload-area">
                  <svg className="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="upload-text">Click to upload pothole image</span>
                  <span className="upload-subtext">PNG, JPG up to 10MB</span>
                  <input
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="file-input"
                    required
                  />
                </label>
              ) : (
                <div className="image-preview-container">
                  <img src={imagePreview || "/placeholder.svg"} alt="Pothole preview" className="image-preview" />
                  <button type="button" onClick={removeImage} className="remove-image-btn">
                    <svg className="remove-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Location Section */}
          <div className="form-group">
            <label htmlFor="location" className="form-label">
              Location / Address <span className="required">*</span>
            </label>
            <input
              id="location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Enter street address or nearest intersection"
              className="input"
              required
            />
          </div>

          {/* Description Section */}
          <div className="form-group">
            <label htmlFor="description" className="form-label">
              Detailed Description <span className="required">*</span>
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the pothole size, depth, severity, and any immediate hazards..."
              className="textarea"
              rows={5}
              required
            />
          </div>

          {/* Submit Button */}
          <button type="submit" className="submit-btn">
            Submit Report
          </button>
        </form>
      </div>
    </div>
  )
}