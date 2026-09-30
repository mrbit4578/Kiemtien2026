---
doc_id: "nn-knowledge-map-v1"
title: "Bản đồ kiến thức mạng nơ-ron trong AI"
version: "1.0"
source_pdf: "Ban_do_kien_thuc_mang_no_ron_AI.pdf"
compiled_date: "2026-09-30"
language: "vi"
total_sources: 50
tags: ["neural-networks", "deep-learning", "machine-learning", "knowledge-map", "roadmap"]
status: "ready-for-integration"
cross_refs: ["nn-llm-agent-v1"]
---

# Bản đồ kiến thức mạng nơ-ron trong AI

> **Nguồn gốc:** Tổng hợp ngày 30/09/2026 từ 50 nguồn tra cứu, từ nền tảng đến chuyên sâu.
> **Phạm vi:** Mạng nơ-ron là một họ mô hình học máy. Trong học sâu, nhiều phép biến đổi
> được ghép thành các tầng để học biểu diễn từ dữ liệu. AI là phạm vi rộng hơn —
> học mạng nơ-ron không đồng nghĩa với học toàn bộ AI.
> **Lưu ý biên soạn:** Thứ tự ưu tiên, phân mức học và bài tập ứng dụng là đề xuất biên soạn;
> kiến thức kỹ thuật có dẫn nguồn tham khảo kèm theo.

## Mục lục

1. [Khung kiến thức tổng quan](#1-khung-kiến-thức-tổng-quan)
2. [Một mạng nơ-ron hoạt động như thế nào](#2-một-mạng-nơ-ron-hoạt-động-như-thế-nào)
3. [Nền tảng và kiểm tra chất lượng](#3-nền-tảng-và-kiểm-tra-chất-lượng)
4. [Các họ mạng và mô hình chính](#4-các-họ-mạng-và-mô-hình-chính)
5. [Hướng chuyên sâu và kỹ thuật bổ sung](#5-hướng-chuyên-sâu-và-kỹ-thuật-bổ-sung)
6. [Khi chuyển sang hệ thống thực tế (MLOps)](#6-khi-chuyển-sang-hệ-thống-thực-tế-mlops)
7. [Danh mục 50 nguồn tra cứu](#7-danh-mục-50-nguồn-tra-cứu)
8. [Lộ trình học 16 tuần](#8-lộ-trình-học-16-tuần)
9. [Bài tập thực hành](#9-bài-tập-thực-hành)
10. [Gợi ý ứng dụng trong kho và sản xuất](#10-gợi-ý-ứng-dụng-trong-kho-và-sản-xuất)
11. [Từ vựng](#11-từ-vựng)
12. [Câu hỏi tự kiểm tra](#12-câu-hỏi-tự-kiểm-tra)
13. [Hướng dẫn tích hợp vào dự án](#13-hướng-dẫn-tích-hợp-vào-dự-án)

**Cách dùng:** Đọc mục 1–5 để nắm khung kiến thức; dùng mục 7 để chọn nguồn;
tham khảo lộ trình và bài tập ở mục 8–9. Các mã `[01]`–`[50]` dẫn đến mục nguồn tương ứng.

**Điểm bắt đầu được đề xuất:**
- Nếu chưa học lập trình: bắt đầu với hình minh họa `[01]`, kiến thức ML `[02]` và Python cơ bản.
- Nếu đã viết Python: học `[20]` song song với `[04]`.
- Chỉ chọn một nhánh chuyên sâu sau khi tự huấn luyện và đánh giá được một mạng nhỏ.

---

## 1. Khung kiến thức tổng quan

| Mảng kiến thức | Những nội dung cần nhận diện |
|---|---|
| Toán và lập trình | Vector, ma trận, đạo hàm, xác suất, Python, tensors. [03] [20] |
| Cấu trúc mạng | Nơ-ron, trọng số, bias, tầng ẩn, hàm kích hoạt. [41] |
| Cách mạng học | Loss, gradient, backpropagation, optimizer. [42] [44] |
| Thiết kế thí nghiệm | Chia dữ liệu, baseline, đánh giá, rò rỉ dữ liệu. [02] [25] |
| Kiến trúc | MLP, CNN, RNN, Transformer, GNN, mô hình sinh. [04] [16] [19] |
| Học và thích nghi | Supervised, self-supervised, transfer learning, fine-tuning. [07] [14] [23] |
| Hệ thống | Lưu mô hình, tối ưu tài nguyên, triển khai, theo dõi. [20] [24] |
| Nghiên cứu | Deep RL, PINNs, Neural ODE, SNN, GRNN và các nhánh khác. [18] [26] [38] [39] [40] |

---

## 2. Một mạng nơ-ron hoạt động như thế nào

Với một nơ-ron trong tầng kết nối đầy đủ, đầu vào được nhân với trọng số,
cộng bias rồi đưa qua hàm kích hoạt. Công thức dưới đây mô tả một đơn vị tính toán;
không phải mô tả đầy đủ một nơ-ron sinh học. [01] [41]

```
z = w₁x₁ + … + wₙxₙ + b
a = φ(z)
```

| Ký hiệu | Ý nghĩa |
|---|---|
| `x` | Dữ liệu đầu vào, chẳng hạn các giá trị điểm ảnh. |
| `w` và `b` | Trọng số và bias: những tham số được học. |
| `φ` | Hàm kích hoạt, ví dụ ReLU hoặc sigmoid. |
| `a` | Giá trị đầu ra của nơ-ron. |

Với cả tầng: `h = φ(Wx + b)`. Nhiều tầng nối tiếp tạo ra một ánh xạ từ dữ liệu
đầu vào đến đầu ra. Phi tuyến giúp mạng biểu diễn các quan hệ mà một chuỗi phép
biến đổi tuyến tính đơn thuần không thể tạo thêm. [41]

### Vòng lặp huấn luyện thông thường

1. **Forward pass:** tính đầu ra dự đoán từ dữ liệu và tham số hiện tại.
2. **Loss:** đo mức sai lệch theo mục tiêu học.
3. **Backpropagation:** dùng quy tắc dây chuyền để tính gradient của loss theo tham số.
4. **Optimizer:** dùng gradient để cập nhật tham số.
5. Lặp lại qua các batch, đồng thời đánh giá trên tập validation. [42] [44]

```
θ_mới = θ_cũ − η · ∇L
```

- `θ`: tập tham số; `η`: learning rate; `L`: loss.
- Đây là dạng cập nhật gradient descent cơ bản. Adam có quy tắc cập nhật riêng,
  sử dụng các ước lượng moment của gradient. [44] [28]

### Những khái niệm dễ bị nhầm

- **Backpropagation** tính gradient; **optimizer** cập nhật tham số.
- **Batch** là một nhóm mẫu xử lý trong một lượt; **epoch** là một lượt đi qua tập huấn luyện.
- Trọng số là tham số được học; learning rate và batch size là ví dụ về siêu tham số. [42] [44]
- **Training** dùng dữ liệu và mục tiêu học để điều chỉnh tham số.
- **Inference** thông thường dùng mô hình đã học để tính đầu ra.
- Bài hướng dẫn PyTorch tách các bước huấn luyện, đánh giá, lưu và sử dụng mô hình. [20]

---

## 3. Nền tảng và kiểm tra chất lượng

### 3.1. Nền tảng cần học

| Nền tảng | Nội dung | Mục đích |
|---|---|---|
| Đại số tuyến tính | Vector, ma trận, tích vô hướng, tensor | Hiểu phép tính của tầng và kích thước dữ liệu. |
| Giải tích | Đạo hàm riêng, gradient, quy tắc dây chuyền | Hiểu lan truyền ngược và tối ưu. |
| Xác suất | Phân phối, kỳ vọng, likelihood | Hiểu dữ liệu, loss và sự không chắc chắn. |
| Python | Hàm, lớp, mảng, đọc dữ liệu, notebook | Thực hiện bài tập và kiểm tra mô hình. |

Nguồn toán: [03]. Nguồn công cụ và tensors: [20].

### 3.2. Các cách đặt bài toán học (không phải kiến trúc mạng)

| Cách học | Ý tưởng |
|---|---|
| Học có giám sát (Supervised) | Học từ cặp đầu vào và nhãn. |
| Học không giám sát (Unsupervised) | Học cấu trúc hoặc biểu diễn từ dữ liệu không có nhãn. |
| Tự giám sát (Self-supervised) | Tạo tín hiệu học từ chính dữ liệu. |
| Học tăng cường (Reinforcement) | Học cách chọn hành động dựa trên tương tác và phần thưởng. [07] [23] [18] |

### 3.3. Chia dữ liệu và rò rỉ dữ liệu

- **Tập train:** dùng để học tham số.
- **Tập validation:** ước lượng chất lượng, phục vụ chọn cấu hình/mô hình.
- **Tập test:** đánh giá cuối cùng trên dữ liệu giữ riêng.
- Tiền xử lý có bước học thống kê (ví dụ chuẩn hóa) cần được **fit trên phần train**.
- Dùng thông tin test trong quá trình này gây **rò rỉ dữ liệu**. [02] [25]

### 3.4. Chỉ số đánh giá theo bài toán

| Bài toán | Chỉ số cần tìm hiểu |
|---|---|
| Hồi quy | MAE, RMSE; phân tích sai số theo nhóm dữ liệu. |
| Phân loại | Precision, recall, F1, confusion matrix; không chỉ accuracy. |
| Phát hiện và phân đoạn ảnh | IoU, AP hoặc mAP; kiểm tra theo loại đối tượng và điều kiện chụp. |

Nguồn học đánh giá: [02] [14].
> Hãy chọn chỉ số dựa trên hậu quả của từng loại sai sót, rồi so sánh với một mô hình
> hoặc quy tắc đơn giản làm baseline.

### 3.5. Những vấn đề cần nhận biết khi huấn luyện

Overfitting và underfitting; gradient tiêu biến hoặc bùng nổ; learning rate không phù hợp;
mất cân bằng nhãn; thay đổi phân phối dữ liệu; khác biệt giữa chế độ train và eval.
Các nội dung này được trình bày trong sách, khóa thực hành và hướng dẫn regularization. [04] [13] [43]

> Trước khi tăng độ sâu của mạng, hãy kiểm tra nhãn, cách chia dữ liệu,
> đường cong train/validation và một số mẫu dự đoán sai.
> Kết quả tốt trên tập huấn luyện chưa đủ để quyết định triển khai.

---

## 4. Các họ mạng và mô hình chính

> Các mục dưới đây không hoàn toàn cùng cấp phân loại: có mục là kiến trúc mạng,
> có mục là khung học hoặc họ mô hình sinh. Chúng có thể được kết hợp trong cùng một hệ thống.

| Họ mạng / mô hình | Ý tưởng cốt lõi | Nguồn |
|---|---|---|
| Perceptron và MLP | Kết hợp trọng số và các tầng phi tuyến. MLP là nền tảng để học cách xây mạng. | [01] [41] |
| CNN | Tích chập dùng bộ lọc chia sẻ trên các vị trí; khai thác cấu trúc cục bộ, thường gặp trong bài toán ảnh. | [14] |
| ResNet | Kết nối tắt giúp học phần thay đổi so với đầu vào của khối; thiết kế quan trọng cho mạng sâu. | [29] |
| RNN, LSTM, GRU | Duy trì trạng thái khi xử lý chuỗi. LSTM và GRU dùng các cổng để điều tiết thông tin. | [04] [15] |
| Transformer | Ghép attention, các tầng feedforward và thông tin vị trí để xử lý quan hệ giữa các phần của đầu vào. | [30] |
| GNN | Cập nhật biểu diễn nút hoặc cạnh dựa trên quan hệ trong đồ thị. | [16] |
| Autoencoder | Mã hóa dữ liệu sang biểu diễn ẩn rồi tái tạo; thường dùng để nghiên cứu biểu diễn. | [07] |
| VAE | Học mô hình biến ẩn xác suất bằng suy luận biến phân. | [31] |
| GAN | Bộ sinh và bộ phân biệt được huấn luyện trong một bài toán đối kháng. | [32] |
| Diffusion | Học quá trình đảo ngược sự thêm nhiễu để xây mô hình sinh. | [33] |
| Flow matching | Học trường vector mô tả cách vận chuyển một phân phối sang phân phối khác. | [19] |

**Hướng chọn nhánh để học:**
- Ảnh và kiểm tra ngoại quan → CNN hoặc mô hình thị giác.
- Văn bản → NLP và Transformer.
- Chuỗi thời gian → bắt đầu từ baseline rồi thử mô hình chuỗi.
- Dữ liệu có quan hệ → GNN.
- Cần thí nghiệm trước khi kết luận mô hình phù hợp với một dữ liệu cụ thể.

---

## 5. Hướng chuyên sâu và kỹ thuật bổ sung

| Chủ đề | Nội dung cần tìm hiểu |
|---|---|
| Regularization | Weight decay, dropout, early stopping và augmentation; học quan hệ giữa độ phức tạp và tổng quát hóa. [07] [43] |
| Huấn luyện mạng sâu | Khởi tạo, normalization, residual connections, learning rate schedule và theo dõi gradient. [13] [28] [29] |
| Transfer learning | Sử dụng mô hình đã huấn luyện làm điểm xuất phát; fine-tuning điều chỉnh mô hình cho bài toán mới. [14] [23] |
| LoRA | Đóng băng phần trọng số gốc và học các ma trận cập nhật hạng thấp theo thiết kế của phương pháp. [34] |
| MoE | Bộ định tuyến chọn chuyên gia để xử lý đầu vào; cần hiểu việc phân bố tải và chi phí truyền thông. [36] |
| State space và Mamba | Mô hình chuỗi với trạng thái chọn lọc; một hướng kiến trúc để nghiên cứu bên cạnh attention. [35] |
| RAG | Tổ chức truy xuất tài liệu kết hợp mô hình sinh. RAG là cách xây hệ thống, không đồng nghĩa với tự huấn luyện một mạng mới từ đầu. [37] |
| Deep reinforcement learning | Mạng biểu diễn policy hoặc value; tìm hiểu DQN, actor-critic, policy gradient và đánh giá trong môi trường. [18] |
| PINNs và Neural ODE | PINNs đưa ràng buộc vật lý vào bài toán học; Neural ODE dùng mạng để mô tả đạo hàm trạng thái liên tục. [39] [38] |
| SNN và GRNN | SNN dùng tín hiệu phát xung. GRNN là một phương pháp hồi quy nơ-ron; cần phân biệt với mạng sâu và với mạng hồi tiếp RNN. [26] [40] |

---

## 6. Khi chuyển sang hệ thống thực tế (MLOps)

Các hướng kỹ thuật tiếp theo gồm: profiling, mixed precision, huấn luyện phân tán,
pruning, distillation và triển khai mô hình. Mục lục PyTorch có hướng dẫn cho nhiều
kỹ thuật này; Full Stack Deep Learning trình bày chu trình phát triển sản phẩm ML. [20] [24]

> Chỉ tối ưu tài nguyên sau khi đã đo được điểm nghẽn và chất lượng đầu ra.
> Với người mới, xây một mô hình nhỏ và đánh giá rõ ràng là mốc hợp lý
> trước khi nghiên cứu huấn luyện quy mô lớn.

---

## 7. Danh mục 50 nguồn tra cứu

> Không cần đọc đồng thời tất cả. Bắt đầu bằng một nguồn tổng quan, sau đó chọn
> một hướng ứng dụng. Yêu cầu tiên quyết và quyền truy cập bài tập được nêu trên từng trang.

### 7.1. Nguồn nền tảng và tài liệu tiếng Việt `[01]`–`[09]`

| Mã | Tên nguồn | Tác giả / Tổ chức | Địa chỉ | Ghi chú |
|---|---|---|---|---|
| [01] | But what is a Neural Network | 3Blue1Brown | https://www.3blue1brown.com | Video và minh họa về nơ-ron, trọng số, tầng mạng và nhận dạng chữ số. Điểm bắt đầu để hình dung cấu trúc mạng. |
| [02] | Machine Learning Crash Course | Google | https://developers.google.com | Hồi quy, phân loại, dữ liệu, overfitting, mạng nơ-ron, embeddings và hệ thống ML. Có bài tập và hình minh họa tương tác. |
| [03] | Mathematics for Machine Learning | Deisenroth, Faisal, Ong | https://mml-book.github.io | Sách toán nền tảng: đại số tuyến tính, giải tích vector, xác suất và tối ưu. Tác giả cung cấp PDF trên trang sách. |
| [04] | Dive into Deep Learning | Nhóm tác giả D2L | https://d2l.ai | Sách kết hợp công thức và mã nguồn: MLP, CNN, RNN, attention, tối ưu và ứng dụng. Dùng mục lục để tra cứu theo chủ đề. |
| [05] | Neural Networks and Deep Learning | Michael Nielsen | https://neuralnetworksanddeeplearning.com | Sách trực tuyến tập trung vào mạng nơ-ron và backpropagation. Đọc chậm để hiểu toán; ví dụ mã thuộc thế hệ cũ. |
| [06] | Understanding Deep Learning | Simon J. D. Prince | https://udlbook.github.io | Sách học sâu kèm tài nguyên giảng dạy; kho github.com/udlbook/udlbook có notebooks, slides, bài tập. |
| [07] | Deep Learning | Goodfellow, Bengio, Courville | https://www.deeplearningbook.org | Sách tham khảo về toán, mô hình, tối ưu, regularization và nghiên cứu. Bản 2016 — đọc cùng nguồn riêng về Transformer và diffusion. |
| [08] | Bài về Multilayer Perceptron | Machine Learning cơ bản | https://machinelearningcoban.com | Giải thích MLP, hàm XOR và backpropagation bằng tiếng Việt. Dùng để đối chiếu thuật ngữ với tài liệu tiếng Anh. |
| [09] | Đắm mình vào Học Sâu | Nhóm dịch AIVIVN | https://d2l.aivivn.com | Bản dịch cộng đồng của D2L (phiên bản 0.14.4, nền tảng MXNet); khi chạy bài tập cần đối chiếu mã ở nguồn gốc. |

### 7.2. Khóa học theo hướng chuyên môn `[10]`–`[19]`

| Mã | Tên khóa học | Đơn vị | Địa chỉ | Ghi chú |
|---|---|---|---|---|
| [10] | Deep Learning Specialization | DeepLearning.AI, Andrew Ng | https://www.deeplearning.ai | Chuỗi 5 khóa: mạng nơ-ron, cải thiện huấn luyện, tổ chức dự án, CNN, mô hình chuỗi. |
| [11] | Introduction to Deep Learning 6.S191 | MIT | https://introtodeeplearning.com | Nhập môn học sâu + thực hành: thị giác, ngôn ngữ, mô hình sinh. Cần nền tảng đạo hàm và nhân ma trận. |
| [12] | Practical Deep Learning for Coders | fast.ai | https://course.fast.ai | Hướng thực hành: ảnh, dữ liệu bảng, NLP, triển khai. Dành cho người đã lập trình được. |
| [13] | Neural Networks: Zero to Hero | Andrej Karpathy | https://karpathy.ai | Xây mạng từ mã nguồn: micrograd, backpropagation, MLP, mô hình ngôn ngữ. Cần Python và toán nhập môn. |
| [14] | CS231n — Deep Learning for Computer Vision | Stanford | https://cs231n.stanford.edu | Thị giác máy tính, kiến trúc mạng, huấn luyện, bài tập. Dùng cho phân loại/phát hiện/phân đoạn ảnh. |
| [15] | CS224N — NLP with Deep Learning | Stanford | https://web.stanford.edu | Biểu diễn từ, mô hình chuỗi, học sâu cho ngôn ngữ. Nền tảng NLP trước các hướng chuyên sâu. |
| [16] | CS224W — Machine Learning with Graphs | Stanford | https://web.stanford.edu | Biểu diễn đồ thị, node embeddings, GNN, đồ thị tri thức. Slides và bài tập công khai tùy kỳ học. |
| [17] | CS336 — Language Modeling from Scratch | Stanford (bản lưu trữ 2025) | https://cs336.stanford.edu | Xây tokenizer, Transformer, huấn luyện, xử lý dữ liệu, đánh giá. Khóa nâng cao: cần Python, PyTorch, kiến thức hệ thống. |
| [18] | CS285 — Deep Reinforcement Learning | UC Berkeley | https://rail.eecs.berkeley.edu | Policy gradient, actor-critic, Q-learning, offline RL, mô hình môi trường. Học sau xác suất và mạng cơ bản. |
| [19] | Introduction to Flow Matching and Diffusion Models | MIT | https://diffusion.csail.mit.edu | Tài liệu, bài giảng và labs về hai họ mô hình sinh. Cần xác suất, đạo hàm, nền tảng mạng nơ-ron. |

### 7.3. Công cụ và nguồn thực hành `[20]`–`[26]`, `[48]`–`[49]`

> Có thể chọn PyTorch làm công cụ thực hành đầu tiên. Keras và TensorFlow là lựa chọn khác;
> JAX nên để sau khi đã quen tensors và gradient. Đây là đề xuất học tập, không phải xếp hạng công cụ.

| Mã | Tên nguồn | Đơn vị | Địa chỉ | Ghi chú |
|---|---|---|---|---|
| [20] | Learn the Basics | PyTorch | https://docs.pytorch.org | Quy trình thực hành: tensors, dữ liệu, xây mạng, autograd, tối ưu, lưu mô hình. Bài mẫu dùng FashionMNIST. |
| [21] | Developer Guides | Keras | https://keras.io | Xây và huấn luyện mô hình, vòng lặp tùy chỉnh, lưu mô hình, các backend. Lựa chọn khác khi học công cụ triển khai. |
| [22] | JAX Documentation | Nhóm phát triển JAX | https://docs.jax.dev | Tính toán mảng, tự động vi phân, biên dịch, vector hóa. Dành cho hướng tính toán/nghiên cứu sau khi hiểu nền tảng. |
| [23] | LLM Course | Hugging Face | https://huggingface.co | Transformers, Datasets, Tokenizers, fine-tuning, chia sẻ mô hình. Nội dung miễn phí. |
| [24] | Full Stack Deep Learning | Bản khóa học 2022 | https://fullstackdeeplearning.com | Tổ chức hệ thống ML: phát triển, dữ liệu, thử nghiệm, triển khai, vận hành. Dùng khi chuyển từ notebook sang sản phẩm. |
| [25] | Common Pitfalls and Recommended Practices | scikit-learn | https://scikit-learn.org | Lỗi tiền xử lý, rò rỉ dữ liệu, cách dùng pipeline. Áp dụng kiểm tra thiết kế thí nghiệm. |
| [26] | snnTorch Tutorials | Nhóm phát triển snnTorch | https://snntorch.readthedocs.io | Mạng nơ-ron phát xung, mô hình nơ-ron, huấn luyện. Nhánh chuyên biệt, không cần học trước MLP/CNN. |
| [48] | TensorFlow 2 Quickstart for Beginners | TensorFlow | https://www.tensorflow.org | Ví dụ nhập môn xây, huấn luyện, đánh giá mạng với TensorFlow và Keras. |
| [49] | The Model Hub | Hugging Face | https://huggingface.co | Tìm và đọc tài liệu mô hình đã huấn luyện: model card, dữ liệu, điều kiện sử dụng, ví dụ triển khai. |

### 7.4. Các bài nghiên cứu để đọc sâu `[27]`–`[40]`

> Năm bên dưới là năm công bố hoặc năm bản thảo đầu tiên. Danh sách chọn các công trình
> đại diện, không phải bảng xếp hạng hay lịch sử đầy đủ của lĩnh vực.

| Mã | Tên bài | Tác giả | Năm | Nội dung chính |
|---|---|---|---|---|
| [27] | Learning representations by back-propagating errors | Rumelhart, Hinton, Williams | 1986 | Bài báo kinh điển về học biểu diễn bằng lan truyền ngược sai số. |
| [28] | Adam: A Method for Stochastic Optimization | Kingma, Ba | 2014 | Thuật toán tối ưu sử dụng các ước lượng moment của gradient. |
| [29] | Deep Residual Learning for Image Recognition | He và cộng sự | 2015 | Residual connections và kiến trúc ResNet cho mạng sâu. |
| [30] | Attention Is All You Need | Vaswani và cộng sự | 2017 | Kiến trúc Transformer và cơ chế attention nhiều đầu. |
| [31] | Auto-Encoding Variational Bayes | Kingma, Welling | 2013 | Nền tảng VAE và suy luận biến phân. |
| [32] | Generative Adversarial Networks | Goodfellow và cộng sự | 2014 | Khung học đối kháng giữa bộ sinh và bộ phân biệt. |
| [33] | Denoising Diffusion Probabilistic Models | Ho, Jain, Abbeel | 2020 | Mô hình sinh dựa trên quá trình thêm nhiễu và học khử nhiễu. |
| [34] | LoRA: Low-Rank Adaptation of Large Language Models | Hu và cộng sự | 2021 | Thích nghi mô hình bằng các ma trận cập nhật hạng thấp. |
| [35] | Mamba: Linear-Time Sequence Modeling with Selective State Spaces | Gu, Dao | 2023 | Mô hình chuỗi dùng không gian trạng thái có tính chọn lọc. |
| [36] | Switch Transformers | Fedus, Zoph, Shazeer | 2021 | Thiết kế Mixture of Experts với cơ chế chọn phần mạng xử lý dữ liệu. |
| [37] | Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks | Lewis và cộng sự | 2020 | Kết hợp truy xuất tài liệu với mô hình sinh trong hệ thống RAG. |
| [38] | Neural Ordinary Differential Equations | Chen và cộng sự | 2018 | Mô hình hóa diễn biến liên tục của trạng thái ẩn bằng phương trình vi phân. |
| [39] | Physics-Informed Deep Learning (Part I) | Raissi, Perdikaris, Karniadakis | 2017 | Mạng học với các ràng buộc từ phương trình vật lý. Nguồn mở đầu cho PINNs. |
| [40] | A General Regression Neural Network | D. F. Specht | 1991 | Bài gốc về GRNN (DOI: 10.1109/72.97934); không phải kiến trúc mạng sâu nhiều tầng theo nghĩa thông thường. |

**Cách đọc một bài nghiên cứu:** Ghi lại 6 điểm — bài toán, ý tưởng, dữ liệu, baseline,
cách đánh giá, giới hạn. Sau đó tìm mã nguồn do tác giả công bố và thử tái tạo một
thí nghiệm nhỏ. Kiểm tra phiên bản bài, phụ lục và điều kiện thí nghiệm trước khi
so sánh con số giữa hai công trình.

**Tìm nghiên cứu tiếp theo:** dùng cụm từ như "neural network backpropagation",
"time series forecasting benchmark", "industrial visual anomaly detection",
"physics informed neural networks". Chọn từ khóa theo bài toán trước, rồi mới chọn tên kiến trúc.

### 7.5. Tra cứu cơ chế và tìm nghiên cứu tiếp theo `[41]`–`[47]`, `[50]`

| Mã | Tên nguồn | Địa chỉ | Ghi chú |
|---|---|---|---|
| [41] | Multilayer Perceptrons (D2L mục 5.1) | https://d2l.ai | Công thức tầng ẩn, ánh xạ phi tuyến, hàm kích hoạt. Nguồn chi tiết cho phần cơ chế. |
| [42] | Forward/Backward Propagation and Computational Graphs (D2L mục 5.3) | https://d2l.ai | Phân biệt lượt tính xuôi, đồ thị tính toán và gradient tính ngược. |
| [43] | Dropout (D2L mục 5.6) | https://d2l.ai | Regularization bằng dropout; cách hoạt động khi huấn luyện so với suy luận. |
| [44] | Optimizing Model Parameters | https://docs.pytorch.org | Loss, learning rate, batch size, epoch, vòng lặp huấn luyện và đánh giá. Đọc cùng mã mẫu chính thức. |
| [45] | OpenReview | https://openreview.net | Tra cứu bài nghiên cứu và nội dung phản biện khi được công khai. Kiểm tra venue và trạng thái từng bài. |
| [46] | NeurIPS Proceedings | https://proceedings.neurips.cc | Tra cứu bài theo năm trong kỷ yếu hội nghị. Lần theo công trình gốc từ tài liệu học. |
| [47] | Proceedings of Machine Learning Research (PMLR) | https://proceedings.mlr.press | Kỷ yếu nhiều hội nghị/workshop học máy; mỗi tập gắn với một sự kiện. |
| [50] | Machine Learning — Recent Submissions (arXiv) | https://arxiv.org | Danh mục bản thảo học máy. Phân biệt bản thảo arXiv với bài đã được chấp nhận ở hội nghị/tạp chí. |

---

## 8. Lộ trình học 16 tuần

> Lộ trình tham khảo, giả định 5–7 giờ/tuần. Thời lượng không phải cam kết đạt trình độ;
> nếu chưa biết Python, nên thêm một giai đoạn học lập trình trước.

| Giai đoạn | Nội dung và nguồn | Sản phẩm để tự kiểm tra |
|---|---|---|
| Tuần 1–2 | Python, mảng, vector và đạo hàm cơ bản. Nguồn [01], [02], [03]. | Tính được đầu ra của một nơ-ron và giải thích từng ký hiệu. |
| Tuần 3–4 | Hồi quy, phân loại, train/validation/test, loss. Nguồn [02], [25]. | Tạo baseline và một bộ dữ liệu đã chia rõ ràng. |
| Tuần 5–6 | MLP, backpropagation, optimizer. Nguồn [08], [13], [41], [42]. | Viết mạng nhỏ hoặc micrograd; giải thích gradient dùng để làm gì. |
| Tuần 7–8 | Tensors, autograd, DataLoader, lưu mô hình. Nguồn [20], [44]. | Huấn luyện mô hình FashionMNIST và lập bảng kết quả test. |
| Tuần 9–10 | Chọn một hướng: ảnh, văn bản hoặc chuỗi. Nguồn [14], [15], [23] hoặc [04]. | Một notebook hoàn chỉnh với dữ liệu và tiêu chí đánh giá. |
| Tuần 11–12 | Regularization, fine-tuning, phân tích sai. Nguồn [13], [23], [43]. | So sánh có kiểm soát 2–3 cấu hình trên cùng cách chia dữ liệu. |
| Tuần 13–14 | Lưu cấu hình, giao diện thử nghiệm, độ trễ. Nguồn [24]. | Bản demo nhận dữ liệu mới, có ghi nhận đầu ra và lỗi. |
| Tuần 15–16 | Đọc một bài nghiên cứu và hoàn thiện báo cáo. Nguồn [27]–[40]. | Báo cáo nêu baseline, kết quả, giới hạn và bước tiếp theo. |

**Cách tổ chức mỗi buổi học:** dành một phần thời gian đọc/xem bài giảng, phần lớn thời gian
làm bài, phần cuối ghi lại lỗi. Khi dùng ví dụ có sẵn, hãy thay một thành phần,
dự đoán điều sẽ thay đổi rồi kiểm tra bằng kết quả chạy.

---

## 9. Bài tập thực hành

### Bài thực hành đầu tiên được đề xuất

Dùng **FashionMNIST** theo hướng dẫn PyTorch [20]. Mục tiêu học là hiểu tensors, loss,
autograd, train và test. Hoàn thành bằng một báo cáo ngắn: mô hình nào, chia dữ liệu
ra sao, chỉ số gì, sai ở những mẫu nào.

> Bộ dữ liệu này phục vụ học thao tác; không đại diện trực tiếp cho ảnh kiểm tra
> chất lượng giày trong nhà máy.

### Checklist bài tập theo giai đoạn

- [ ] Tính tay forward pass của 1 nơ-ron và 1 tầng (mục 2).
- [ ] Cài đặt micrograd / MLP từ scratch, giải thích backpropagation (tuần 5–6).
- [ ] Huấn luyện FashionMNIST, lập bảng so sánh train/test (tuần 7–8).
- [ ] Thử nghiệm có kiểm soát: thay 1 thành phần → dự đoán → kiểm chứng (mọi giai đoạn).
- [ ] Phân tích 10 mẫu dự đoán sai và phân loại nguyên nhân (tuần 11–12).
- [ ] Đọc 1 paper trong [27]–[40], tái tạo 1 thí nghiệm nhỏ, viết báo cáo (tuần 15–16).

---

## 10. Gợi ý ứng dụng trong kho và sản xuất

> Các hướng dưới đây là đề xuất thử nghiệm theo công việc kho và sản xuất giày.
> Chưa thể xác định hiệu quả hoặc chọn kiến trúc cuối cùng nếu chưa có dữ liệu vận hành thực tế.

| Bài toán thử nghiệm | Dữ liệu cần chuẩn bị | Cách đánh giá đề xuất |
|---|---|---|
| Phân loại lỗi ngoại quan | Ảnh có nhãn loại lỗi hoặc đạt/chưa đạt; mã lô, điều kiện chụp. | Precision và recall theo loại lỗi. Giữ riêng một số lô/đợt chụp để kiểm tra. |
| Dự báo lượng xuất kho | Lịch sử xuất theo thời gian, mã hàng, đơn hàng đã biết tại thời điểm dự báo. | MAE/RMSE trên giai đoạn về sau; so với dự báo đơn giản dựa trên lịch sử. |
| Phát hiện bất thường môi trường | Chuỗi đo nhiệt độ, độ ẩm; thời điểm thiết bị lỗi và ghi nhận sự kiện. | Số cảnh báo sai và khả năng nhận ra sự kiện đã xác nhận; so với ngưỡng nghiệp vụ đang dùng. |
| Tra cứu quy trình nội bộ | SOP, quy định, phiên bản tài liệu, danh sách câu hỏi mẫu. | Đúng tài liệu, đúng phiên bản, câu trả lời có căn cứ; xây bộ câu hỏi đánh giá trước. |
| Dự đoán chỉ tiêu lưu hóa | Dữ liệu thí nghiệm: vật liệu, công thức, nhiệt độ, thời gian, chỉ tiêu đo. | Sai số trên các lô độc lập; so sánh hồi quy, mô hình cây và mạng phù hợp dữ liệu. |

**Nguồn để bắt đầu theo từng hướng:** thị giác [14]; mô hình chuỗi [04];
hệ thống dữ liệu và triển khai [24]; RAG [37]; mô hình vật lý và hồi quy nơ-ron [39], [40].
Các nguồn này cung cấp phương pháp, không xác nhận hiệu quả cho dữ liệu doanh nghiệp cụ thể.

### Đề cương cho một dự án nhỏ

Viết trước một trang mô tả: quyết định nào cần hỗ trợ; ai sử dụng kết quả;
dữ liệu nào có sẵn khi dự đoán; lỗi nào tốn chi phí hơn; baseline nào cần vượt;
cách chia test; điều kiện chấp nhận thử nghiệm. Chọn một bài toán có dữ liệu
và tiêu chí rõ nhất để bắt đầu.

### Điểm dừng trước triển khai

Chỉ xem kết quả như bằng chứng cho đúng bộ dữ liệu và điều kiện đã kiểm tra.
Khi đưa vào vận hành, cần theo dõi dữ liệu thay đổi (data drift), phân tích lỗi
và giữ khả năng quay về quy trình hiện có nếu kết quả không đạt yêu cầu.

---

## 11. Từ vựng

| Thuật ngữ | Cách hiểu ngắn gọn |
|---|---|
| Feature và label | Đặc trưng đầu vào và nhãn mục tiêu. |
| Tensor | Mảng nhiều chiều dùng để biểu diễn dữ liệu và tham số. |
| Weight và bias | Trọng số và hệ số dịch trong một phép tính của mạng. |
| Activation | Hàm biến đổi đầu ra của nơ-ron hoặc tầng. |
| Loss | Đại lượng được tối ưu trong quá trình học. |
| Gradient | Các đạo hàm riêng của hàm theo những biến đang xét. |
| Backpropagation | Tính gradient ngược qua đồ thị tính toán. |
| Optimizer | Quy tắc điều chỉnh tham số trong quá trình học. |
| Learning rate | Hệ số điều chỉnh mức cập nhật trong thuật toán tối ưu. |
| Batch và epoch | Nhóm mẫu xử lý trong một lượt và một lượt qua tập train. |
| Embedding | Biểu diễn đối tượng dưới dạng vector. |
| Overfitting | Khớp dữ liệu train nhưng tổng quát hóa kém ra dữ liệu mới. |
| Fine-tuning | Tiếp tục điều chỉnh tham số của mô hình đã được huấn luyện. |
| Inference | Tính đầu ra bằng mô hình để sử dụng hoặc đánh giá. |

---

## 12. Câu hỏi tự kiểm tra

Bạn đã nắm nền tảng khi có thể tự trả lời:

1. Vì sao mạng cần hàm phi tuyến?
2. Backpropagation khác optimizer ở điểm nào?
3. Loss khác chỉ số đánh giá ra sao?
4. Vì sao cần validation và test riêng?
5. Chuẩn hóa toàn bộ dữ liệu trước khi chia có thể gây vấn đề gì?
6. Làm thế nào nhận ra mô hình chỉ học tốt dữ liệu train?
7. Mô hình mới có tốt hơn baseline trên dữ liệu giữ riêng không?
8. Khi dữ liệu thay đổi, bạn sẽ phát hiện bằng cách nào?

---

## 13. Hướng dẫn tích hợp vào dự án

File này được cấu trúc để dễ dàng đưa vào pipeline phát triển và hệ thống RAG:

### 13.1. Cấu trúc machine-readable

- **YAML frontmatter** ở đầu file: `title`, `version`, `tags`, `total_sources`, `status`
  → dùng để lọc/phân loại tài liệu trong kho tri thức.
- **Heading phân cấp** (`##`, `###`) theo chủ đề → mỗi section là một chunk RAG tự nhiên
  (khuyến nghị chunk ~800 ký tự, giữ nguyên bảng).
- **Mã nguồn `[01]`–`[50]`** là anchor ổn định → dùng làm khóa tra cứu chéo giữa các section.
- **Bảng Markdown** cho danh mục nguồn, lộ trình, từ vựng → parse trực tiếp thành JSON/CSV khi cần.

### 13.2. Gợi ý pipeline

```text
markdown  →  split theo ## / ###  →  chunk (~800 ký tự, overlap 100)
        →  embedding (text-embedding-3-small hoặc tương đương)
        →  vector DB (pgvector / Qdrant / Chroma)
        →  truy vấn RAG theo mã nguồn hoặc chủ đề
```

### 13.3. Mở rộng

- Thêm `version` mới khi bổ sung nguồn; giữ nguyên mã `[01]`–`[50]` để không vỡ tham chiếu.
- Mỗi dự án ứng dụng (mục 10) nên tách thành file con riêng: `du-an-<ten>.md`
  với đề cương 1 trang (quyết định cần hỗ trợ, dữ liệu, baseline, tiêu chí chấp nhận).
- Nhật ký thực hành (mục 9) nên lưu dạng `lab-YYYY-MM-DD.md` để theo dõi tiến độ 16 tuần.

### 13.4. Quy ước đặt tên file

```text
ban-do-kien-thuc-mang-no-ron-ai.md   # file tổng (file này)
du-an-phan-loai-loi-ngoai-quan.md    # đề cương dự án ứng dụng
lab-2026-10-01.md                    # nhật ký buổi thực hành
glossary-bo-sung.md                  # từ vựng mở rộng (nếu có)
```

---

## Ghi chú về độ tin cậy và phạm vi

- Tên và nội dung giới thiệu của nguồn được đối chiếu qua trang chính thức, trang tác giả,
  bài nghiên cứu hoặc bản ghi tìm kiếm của chính nguồn.
- Việc có tên trong danh mục không có nghĩa mọi notebook đã được chạy thử.
- Với tài liệu cũ, kiểm tra phiên bản thư viện khi thực hành.
- Hai mục [05] và [10] được xác nhận qua bản ghi tìm kiếm của trang chính thức;
  lần mở trực tiếp trong phiên tra cứu gặp lỗi.
- Danh mục bao quát các nhánh chính; không khẳng định đã thu thập toàn bộ nguồn trên Internet.

*— Hết tài liệu —*
